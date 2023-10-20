import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import { Ec2AMI } from '../constants';

const config = new pulumi.Config('aws');
const awsRegion = config.require('region');

export type Ec2SSMConnectArgs = {
  vpc: awsx.ec2.Vpc;
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

    const subnetId = args.vpc.privateSubnetIds.apply(ids => ids[0]);

    this.ec2SecurityGroup = new aws.ec2.SecurityGroup(
      `${name}-ec2-security-group`,
      {
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 22,
            toPort: 22,
            cidrBlocks: [args.vpc.vpc.cidrBlock],
          },
          {
            protocol: 'tcp',
            fromPort: 443,
            toPort: 443,
            cidrBlocks: [args.vpc.vpc.cidrBlock],
          },
        ],
        egress: [
          { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
        ],
        vpcId: args.vpc.vpcId,
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
      },
      { parent: this, dependsOn: [ssmPolicyAttachment] },
    );

    this.ec2 = new aws.ec2.Instance(
      `${name}-ec2`,
      {
        ami: Ec2AMI.AmazonLinux2023.ARM,
        associatePublicIpAddress: false,
        instanceType: 't4g.nano',
        iamInstanceProfile: ssmProfile.name,
        subnetId,
        vpcSecurityGroupIds: [this.ec2SecurityGroup.id],
        tags: {
          Name: `${name}-ec2`,
          ...args.tags,
        },
      },
      { parent: this },
    );

    this.ssmVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ssm-vpc-endpoint`,
      {
        vpcId: args.vpc.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ssm`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.ec2MessagesVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ec2messages-vpc-endpoint`,
      {
        vpcId: args.vpc.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ec2messages`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.ssmMessagesVpcEndpoint = new aws.ec2.VpcEndpoint(
      `${name}-ssmmessages-vpc-endpoint`,
      {
        vpcId: args.vpc.vpcId,
        ipAddressType: 'ipv4',
        serviceName: `com.amazonaws.${awsRegion}.ssmmessages`,
        vpcEndpointType: 'Interface',
        subnetIds: [subnetId],
        securityGroupIds: [this.ec2SecurityGroup.id],
        privateDnsEnabled: true,
      },
      { parent: this, dependsOn: [this.ec2] },
    );

    this.registerOutputs();
  }
}
