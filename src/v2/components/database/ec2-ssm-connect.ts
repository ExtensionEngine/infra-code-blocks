import * as aws from '@pulumi/aws-v7';
import * as awsx from '@pulumi/awsx-v3';
import * as pulumi from '@pulumi/pulumi';
import { commonTags } from '../../shared/common-tags';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

export namespace Ec2SSMConnect {
  export type Args = {
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    instanceType?: pulumi.Input<string>;
    tags?: pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>;
  };
}

const defaults = {
  instanceType: 't4g.nano',
};

export class Ec2SSMConnect extends pulumi.ComponentResource {
  name: string;
  vpc: pulumi.Output<awsx.ec2.Vpc>;
  ec2SecurityGroup: aws.ec2.SecurityGroup;
  role: aws.iam.Role;
  ssmProfile: aws.iam.InstanceProfile;
  ssmVpcEndpoint: aws.ec2.VpcEndpoint;
  ec2MessagesVpcEndpoint: aws.ec2.VpcEndpoint;
  ssmMessagesVpcEndpoint: aws.ec2.VpcEndpoint;
  ec2: aws.ec2.Instance;
  ami: pulumi.Output<aws.ec2.GetAmiResult>;

  constructor(
    name: string,
    args: Ec2SSMConnect.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:Ec2SSMConnect', name, {}, opts);

    const { vpc, instanceType, tags } = mergeWithDefaults(defaults, args);

    this.name = name;
    this.vpc = pulumi.output(vpc);

    const subnetId = this.vpc.privateSubnetIds.apply(ids => ids[0]);

    this.ami = aws.ec2.getAmiOutput({
      filters: [
        { name: 'architecture', values: ['arm64'] },
        { name: 'root-device-type', values: ['ebs'] },
        { name: 'virtualization-type', values: ['hvm'] },
        { name: 'ena-support', values: ['true'] },
      ],
      owners: ['amazon'],
      nameRegex:
        'al2023-ami-2023\.[0-9]+\.[0-9]+\.[0-9]+-kernel-[0-9]+\.[0-9]+-arm64',
      mostRecent: true,
    });

    this.ec2SecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-ec2-security-group`,
      {
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 22,
            toPort: 22,
            cidrBlocks: [this.vpc.vpc.cidrBlock],
          },
          {
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            cidrBlocks: [this.vpc.vpc.cidrBlock],
          },
        ],
        egress: [
          { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
        ],
        vpcId: this.vpc.vpcId,
        tags: commonTags,
      },
      { parent: this },
    );

    this.role = new aws.iam.Role(
      `${this.name}-ec2-role`,
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
      `${this.name}-ssm-policy-attachment`,
      {
        role: this.role.name,
        policyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
      },
      { parent: this },
    );

    this.ssmProfile = new aws.iam.InstanceProfile(
      `${this.name}-ssm-profile`,
      {
        role: this.role.name,
        tags: commonTags,
      },
      { parent: this, dependsOn: [ssmPolicyAttachment] },
    );

    this.ec2 = new aws.ec2.Instance(
      `${this.name}-ec2`,
      {
        ami: this.ami.id,
        associatePublicIpAddress: false,
        instanceType,
        iamInstanceProfile: this.ssmProfile.name,
        subnetId,
        vpcSecurityGroupIds: [this.ec2SecurityGroup.id],
        tags: {
          ...commonTags,
          Name: `${this.name}-ec2`,
          ...tags,
        },
      },
      { parent: this },
    );

    this.ssmVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${this.name}-ssm-vpc-endpoint`,
      {
        vpcId: this.vpc.vpcId,
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
      `${this.name}-ec2messages-vpc-endpoint`,
      {
        vpcId: this.vpc.vpcId,
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
      `${this.name}-ssmmessages-vpc-endpoint`,
      {
        vpcId: this.vpc.vpcId,
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
