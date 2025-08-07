import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Project, next as studion } from '@studion/infra-code-blocks';

const appName = 'ecs-test';
const stackName = pulumi.getStack();
const appPort = 80;
const tags = {
  Project: appName,
  Environment: stackName,
};
const sampleServiceContainer = {
  name: 'sample-service',
  image: 'amazon/amazon-ecs-sample',
  portMappings: [studion.EcsService.createTcpPortMapping(appPort)],
};

const project = new Project(appName, { services: [] });

const cluster = new aws.ecs.Cluster(
  `${appName}-cluster`,
  {
    name: `${appName}-cluster-${stackName}`,
    tags,
  },
  { parent: project },
);

const minimalEcsService = new studion.EcsService(`${appName}-min`, {
  cluster,
  vpc: project.vpc,
  containers: [sampleServiceContainer],
  tags,
});

const lbSecurityGroup = new aws.ec2.SecurityGroup(`${appName}-lb-sg`, {
  vpcId: project.vpc.vpcId,
  ingress: [
    {
      protocol: 'tcp',
      fromPort: appPort,
      toPort: appPort,
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
  egress: [
    {
      protocol: '-1',
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
  tags,
});

const lb = new aws.lb.LoadBalancer(`${appName}-lb`, {
  internal: false,
  loadBalancerType: 'application',
  securityGroups: [lbSecurityGroup.id],
  subnets: project.vpc.publicSubnetIds,
  tags,
});

const targetGroup = new aws.lb.TargetGroup(`${appName}-tg`, {
  port: appPort,
  protocol: 'HTTP',
  targetType: 'ip',
  vpcId: project.vpc.vpcId,
  healthCheck: {
    path: '/',
    port: 'traffic-port',
  },
  tags,
});

const listener = new aws.lb.Listener(`${appName}-listener`, {
  loadBalancerArn: lb.arn,
  port: appPort,
  protocol: 'HTTP',
  defaultActions: [
    {
      type: 'forward',
      targetGroupArn: targetGroup.arn,
    },
  ],
  tags,
});

const ecsServiceWithLb = new studion.EcsService(`${appName}-lb`, {
  cluster,
  vpc: project.vpc,
  containers: [sampleServiceContainer],
  assignPublicIp: true,
  loadBalancers: [
    {
      containerName: 'sample-service',
      containerPort: appPort,
      targetGroupArn: targetGroup.arn,
    },
  ],
  tags,
});

const lbUrl = pulumi.interpolate`http://${lb.dnsName}`;

const ecsWithDiscovery = new studion.EcsService(`${appName}-sd`, {
  cluster,
  vpc: project.vpc,
  containers: [sampleServiceContainer],
  enableServiceAutoDiscovery: true,
  tags,
});

const ecsServiceWithAutoscaling = new studion.EcsService(
  `${appName}-autoscale`,
  {
    cluster,
    vpc: project.vpc,
    containers: [sampleServiceContainer],
    autoscaling: {
      enabled: true,
      minCount: 2,
      maxCount: 5,
    },
    tags,
  },
);

const ecsServiceWithStorage = new studion.EcsService(`${appName}-storage`, {
  cluster,
  vpc: project.vpc,
  volumes: [{ name: 'data-volume' }],
  containers: [
    {
      name: 'test-container',
      image: 'amazonlinux:2',
      portMappings: [studion.EcsService.createTcpPortMapping(appPort)],
      mountPoints: [
        {
          sourceVolume: 'data-volume',
          containerPath: '/data',
        },
      ],
      environment: [{ name: 'TEST_FILE', value: '/data/test.txt' }],
      // Enables testing EFS functionality based on logs.
      // Command writes to EFS, then reads from it.
      command: [
        'sh',
        '-c',
        "echo 'EFS test content' > $TEST_FILE && " +
          "if [ -f $TEST_FILE ] && grep 'EFS test content' $TEST_FILE; then " +
          "echo 'Successfully wrote to and read from EFS volume'; " +
          'else ' +
          "echo 'Failed to write to or read from EFS volume'; " +
          'exit 1; ' +
          'fi && ' +
          'while true; do sleep 30; done',
      ],
    },
  ],
  tags,
});

const ecsServiceWithEmptyVolumes = new studion.EcsService(
  `${appName}-empty-vol`,
  {
    cluster,
    vpc: project.vpc,
    containers: [sampleServiceContainer],
    volumes: [],
    tags,
  },
);

const ecsServiceWithOutputEmptyVolumes = new studion.EcsService(
  `${appName}-empty-otp-vol`,
  {
    cluster,
    vpc: project.vpc,
    containers: [sampleServiceContainer],
    volumes: pulumi.output([]),
    tags,
  },
);

module.exports = {
  project,
  cluster,
  minimalEcsService,
  ecsServiceWithLb,
  lbUrl,
  ecsWithDiscovery,
  ecsServiceWithAutoscaling,
  ecsServiceWithStorage,
  ecsServiceWithEmptyVolumes,
  ecsServiceWithOutputEmptyVolumes,
};
