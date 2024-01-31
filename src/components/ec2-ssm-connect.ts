import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { commonTags } from '../constants';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

export type Ec2SSMConnectArgs = {
  vpcId: pulumi.Input<string>;
  privateSubnetId: pulumi.Input<string>;
  /**
   * The IPv4 CIDR block for the VPC.
   */
  vpcCidrBlock: pulumi.Input<string>;
  tags?: pulumi.Input<{
    [key: string]: pulumi.Input<string>;
  }>;
};

export class Ec2SSMConnect extends pulumi.ComponentResource {
  ec2SecurityGroup: aws.ec2.SecurityGroup;
  ssmVpcEndpoint: aws.ec2.VpcEndpoint;
  ec2MessagesVpcEndpoint: aws.ec2.VpcEndpoint;
  ssmMessagesVpcEndpoint: aws.ec2.VpcEndpoint;
  ec2: aws.ec2.Instance;

  constructor(
    name: string,
    args: Ec2SSMConnectArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Ec2BastionSSMConnect', name, {}, opts);

    const subnetId = args.privateSubnetId;

    const AmazonLinux2023_ARM_EC2_AMI = aws.ec2.getAmiOutput({
      filters: [
        { name: 'architecture', values: ['arm64'] },
        { name: 'root-device-type', values: ['ebs'] },
        { name: 'virtualization-type', values: ['hvm'] },
        { name: 'ena-support', values: ['true'] },
      ],
      owners: ['amazon'],
      // TODO: Improve this nameRegex property. Use * for kernel version.
      // https://docs.aws.amazon.com/linux/al2023/ug/ec2.html
      nameRegex: 'al2023-ami-20[0-9]+.*-kernel-6.1-arm64',
      mostRecent: true,
    });

    this.ec2SecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-ec2-security-group`,
      {
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 22,
            toPort: 22,
            cidrBlocks: [args.vpcCidrBlock],
          },
          {
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            cidrBlocks: [args.vpcCidrBlock],
          },
        ],
        egress: [
          { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
        ],
        vpcId: args.vpcId,
        tags: commonTags,
      },
      { parent: this },
    );

    const role = new aws.iam.Role(
      `${name}-ec2-role`,
      {
        assumeRolePolicy: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'ec2.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        tags: commonTags,
      },
      { parent: this },
    );

    const ssmPolicyAttachment = new aws.iam.RolePolicyAttachment(
      `${name}-ssm-policy-attachment`,
      {
        role: role.name,
        policyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
      },
      { parent: this },
    );

    const ssmProfile = new aws.iam.InstanceProfile(
      `${name}-ssm-profile`,
      {
        role: role.name,
        tags: commonTags,
      },
      { parent: this, dependsOn: [ssmPolicyAttachment] },
    );

    this.ec2 = new aws.ec2.Instance(
      `${name}-ec2`,
      {
        ami: AmazonLinux2023_ARM_EC2_AMI.id,
        associatePublicIpAddress: false,
        instanceType: 't4g.nano',
        iamInstanceProfile: ssmProfile.name,
        subnetId,
        vpcSecurityGroupIds: [this.ec2SecurityGroup.id],
        tags: {
          ...commonTags,
          Name: `${name}-ec2`,
          ...args.tags,
        },
      },
      { parent: this },
    );

    this.ssmVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ssm-vpc-endpoint`,
      {
        vpcId: args.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ssm`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
        tags: commonTags,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.ec2MessagesVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ec2messages-vpc-endpoint`,
      {
        vpcId: args.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ec2messages`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
        tags: commonTags,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.ssmMessagesVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ssmmessages-vpc-endpoint`,
      {
        vpcId: args.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ssmmessages`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
        tags: commonTags,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.registerOutputs();
  }
}
