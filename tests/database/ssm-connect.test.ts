import {
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  IpPermission,
} from '@aws-sdk/client-ec2';
import {
  GetCommandInvocationCommand,
  SendCommandCommand,
} from '@aws-sdk/client-ssm';
import {
  GetInstanceProfileCommand,
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  Role,
} from '@aws-sdk/client-iam';
import * as assert from 'node:assert';
import { backOff } from '../util';
import { DatabaseTestContext } from './test-context';
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { it } from 'node:test';
import { requireEnv } from '../util';

export function testSSMConnectDb(ctx: DatabaseTestContext) {
  const region = requireEnv('AWS_REGION');

  it('should create a db instance', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const { dbInstanceIdentifier } = ssmConnectDb.instance;

    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: dbInstanceIdentifier,
    });

    const { DBInstances } = await ctx.clients.rds.send(command);
    assert.ok(
      DBInstances &&
        DBInstances.length === 1 &&
        DBInstances[0].DBInstanceIdentifier === dbInstanceIdentifier,
      'Database instance should be created',
    );
  });

  it('should create a security group with correct ingress and egress rules', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const vpc = ctx.outputs.vpc.value;
    const ec2SecurityGroupId = ssmConnectDb.ec2SSMConnect.ec2SecurityGroup.id;

    const command = new DescribeSecurityGroupsCommand({
      GroupIds: [ec2SecurityGroupId],
    });
    const { SecurityGroups } = await ctx.clients.ec2.send(command);
    assert.ok(
      SecurityGroups && SecurityGroups.length > 0,
      'DB security groups should exist',
    );
    const [securityGroup] = SecurityGroups;
    assert.strictEqual(
      securityGroup.VpcId,
      vpc.vpc.vpcId,
      'DB security group should be in the correct VPC',
    );

    const sshRule = securityGroup.IpPermissions?.find(
      (rule: IpPermission) => rule.FromPort === 22 && rule.ToPort === 22,
    );
    assert.ok(sshRule, 'Should have SSH port 22 ingress rule');
    assert.strictEqual(
      sshRule.IpProtocol,
      'tcp',
      'SSH rule should allow TCP protocol',
    );
    assert.deepStrictEqual(
      sshRule.IpRanges?.map(r => r.CidrIp),
      [vpc.vpc.vpc.cidrBlock],
      'SHH rule should allow VPC CIDR block',
    );

    const httpsRule = securityGroup.IpPermissions?.find(
      (rule: IpPermission) => rule.FromPort === 443 && rule.ToPort === 443,
    );
    assert.ok(httpsRule, 'Should have HTTPS port 443 ingress rule');
    assert.strictEqual(
      httpsRule.IpProtocol,
      'tcp',
      'HTTPS rule should allow TCP protocol',
    );
    assert.deepStrictEqual(
      httpsRule.IpRanges?.map(r => r.CidrIp),
      [vpc.vpc.vpc.cidrBlock],
      'HTPPS rule should allow VPC CIDR block',
    );

    const egressRule = securityGroup.IpPermissionsEgress?.find(
      (rule: IpPermission) => rule.IpProtocol === '-1',
    );
    assert.ok(egressRule, 'Should have egress rule allowing all traffic');
    assert.deepStrictEqual(
      egressRule.IpRanges?.map(r => r.CidrIp),
      ['0.0.0.0/0'],
      'Egress rule should allow all CIDR blocks',
    );
  });

  it('should create the correct IAM role and attach the correct policy', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const roleName = ssmConnectDb.ec2SSMConnect.role.name;

    const roleCommand = new GetRoleCommand({
      RoleName: roleName,
    });
    const { Role } = await ctx.clients.iam.send(roleCommand);
    assert.ok(Role, 'IAM role should exist');

    const policyCommand = new ListAttachedRolePoliciesCommand({
      RoleName: roleName,
    });
    const { AttachedPolicies } = await ctx.clients.iam.send(policyCommand);
    assert.ok(
      AttachedPolicies && AttachedPolicies.length > 0,
      'Attached policies should exist',
    );
    const [attachedPolicy] = AttachedPolicies;
    assert.strictEqual(
      attachedPolicy.PolicyArn,
      'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
      'IAM role should have correct policy attached',
    );
  });

  it('should create an instance profile with the correct role', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const instanceProfileName = ssmConnectDb.ec2SSMConnect.ssmProfile.name;
    const roleName = ssmConnectDb.ec2SSMConnect.role.name;

    const profileCommand = new GetInstanceProfileCommand({
      InstanceProfileName: instanceProfileName,
    });
    const { InstanceProfile } = await ctx.clients.iam.send(profileCommand);
    assert.ok(InstanceProfile, 'Instance profile should exist');

    const role = InstanceProfile.Roles?.find(
      (role: Role) => role.RoleName === roleName,
    );
    assert.ok(role, 'Instance profile should have correct role');
  });

  it('should create an EC2 instance with the correct configuration', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const instanceId = ssmConnectDb.ec2SSMConnect.ec2.id;
    const instanceProfileArn = ssmConnectDb.ec2SSMConnect.ssmProfile.arn;
    const amiId = ssmConnectDb.ec2SSMConnect.ami.id;
    const vpc = ctx.outputs.vpc.value;

    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });
    const { Reservations } = await ctx.clients.ec2.send(command);
    assert.ok(
      Reservations && Reservations.length > 0,
      'Reservation should exist',
    );

    const [Reservation] = Reservations;
    const { Instances } = Reservation;
    assert.ok(Instances && Instances.length > 0, 'Instances should exist');

    const [Instance] = Instances;
    assert.strictEqual(
      Instance.InstanceType,
      't4g.nano',
      'Instance type should be t4g.nano',
    );
    assert.strictEqual(
      Instance.IamInstanceProfile?.Arn,
      instanceProfileArn,
      'IAM Instance profile ARN should be correct',
    );
    assert.strictEqual(Instance.ImageId, amiId, 'Image id should be correct');
    assert.strictEqual(
      Instance.SubnetId,
      vpc.vpc.privateSubnetIds[0],
      'Subnet id should be correct',
    );
    assert.strictEqual(
      Instance.VpcId,
      vpc.vpc.vpcId,
      'VPC id should be correct',
    );
  });

  it('should create a SSM VPC endpoint with the correct configuration', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const ssmVpcEndpoint = ssmConnectDb.ec2SSMConnect.ssmVpcEndpoint;
    const vpc = ctx.outputs.vpc.value;
    const ec2SecurityGroupId = ssmConnectDb.ec2SSMConnect.ec2SecurityGroup.id;

    assert.partialDeepStrictEqual(
      ssmVpcEndpoint,
      {
        vpcId: vpc.vpc.vpcId,
        ipAddressType: 'ipv4',
        vpcEndpointType: 'Interface',
        subnetIds: [vpc.vpc.privateSubnetIds[0]],
        securityGroupIds: [ec2SecurityGroupId],
        privateDnsEnabled: true,
        serviceName: `com.amazonaws.${region}.ssm`,
      },
      'SSM VPC endpoint should be properly configured',
    );
  });

  it('should create an EC2 messages VPC endpoint with the correct configuration', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const ec2MessagesVpcEndpoint =
      ssmConnectDb.ec2SSMConnect.ec2MessagesVpcEndpoint;
    const vpc = ctx.outputs.vpc.value;
    const ec2SecurityGroupId = ssmConnectDb.ec2SSMConnect.ec2SecurityGroup.id;

    assert.partialDeepStrictEqual(
      ec2MessagesVpcEndpoint,
      {
        vpcId: vpc.vpc.vpcId,
        ipAddressType: 'ipv4',
        vpcEndpointType: 'Interface',
        subnetIds: [vpc.vpc.privateSubnetIds[0]],
        securityGroupIds: [ec2SecurityGroupId],
        privateDnsEnabled: true,
        serviceName: `com.amazonaws.${region}.ec2messages`,
      },
      'EC2 messages VPC endpoint should be properly configured',
    );
  });

  it('should create a SSM messages VPC endpoint with the correct configuration', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const ssmMessagesVpcEndpoint =
      ssmConnectDb.ec2SSMConnect.ssmMessagesVpcEndpoint;
    const vpc = ctx.outputs.vpc.value;
    const ec2SecurityGroupId = ssmConnectDb.ec2SSMConnect.ec2SecurityGroup.id;

    assert.partialDeepStrictEqual(
      ssmMessagesVpcEndpoint,
      {
        vpcId: vpc.vpc.vpcId,
        ipAddressType: 'ipv4',
        vpcEndpointType: 'Interface',
        subnetIds: [vpc.vpc.privateSubnetIds[0]],
        securityGroupIds: [ec2SecurityGroupId],
        privateDnsEnabled: true,
        serviceName: `com.amazonaws.${region}.ssmmessages`,
      },
      'SSM messages VPC endpoint should be properly configured',
    );
  });

  it('EC2 instance should be able to connect to the database', async () => {
    const ssmConnectDb = ctx.outputs.ssmConnectDb.value;
    const instanceId = ssmConnectDb.ec2SSMConnect.ec2.id;
    const dbHost = ssmConnectDb.instance.endpoint.address;
    const dbPort = ssmConnectDb.instance.endpoint.port;

    const testCommand = `
      if timeout 5 bash -c "</dev/tcp/${dbHost}/${dbPort}";
      then
        echo "success";
      else
        echo "fail";
        exit 1;
      fi  
    `;

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [testCommand],
      },
    });
    const { Command } = await ctx.clients.ssm.send(command);
    assert.ok(Command, 'Command should exist');

    await backOff(async () => {
      const invocationCommand = new GetCommandInvocationCommand({
        CommandId: Command.CommandId,
        InstanceId: instanceId,
      });
      const { Status } = await ctx.clients.ssm.send(invocationCommand);

      assert.strictEqual(
        Status,
        'Success',
        `EC2 instance should be able to connect to the database`,
      );
    });
  });
}
