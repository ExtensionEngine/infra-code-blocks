import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Project, ImprovedEcsService } from '../../../src/';

const appName = 'ecs-test';
const stackName = pulumi.getStack();

const project = new Project(appName, {
  services: []
});

const cluster = new aws.ecs.Cluster(`${appName}-cluster`, {
  name: `${appName}-cluster-${stackName}`,
  tags: {
    Environment: stackName,
  },
}, { parent: project });

const minimalEcsService = new ImprovedEcsService(`${appName}-min`, {
  clusterId: cluster.id,
  clusterName: cluster.name,
  vpc: project.vpc,
  containers: [{
    name: 'sample-service',
    image: 'amazon/amazon-ecs-sample',
    portMappings: [ImprovedEcsService.createTcpPortMapping(80)],
    mountPoints: []
  }]
  // TODO: Should we connect the parent cluster within the ECS Service component?
}, { parent: cluster });

const lbSecurityGroup = new aws.ec2.SecurityGroup(`${appName}-lb-sg`, {
  vpcId: project.vpc.vpcId,
  ingress: [{
    protocol: "tcp",
    fromPort: 80,
    toPort: 80,
    cidrBlocks: ["0.0.0.0/0"]
  }],
  egress: [{
    protocol: "-1",
    fromPort: 0,
    toPort: 0,
    cidrBlocks: ["0.0.0.0/0"]
  }],
});

const lb = new aws.lb.LoadBalancer(`${appName}-lb`, {
  internal: false,
  loadBalancerType: "application",
  securityGroups: [lbSecurityGroup.id],
  subnets: project.vpc.publicSubnetIds,
});

const targetGroup = new aws.lb.TargetGroup(`${appName}-tg`, {
  port: 80,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: project.vpc.vpcId,
  healthCheck: {
    path: "/",
    port: "traffic-port",
  },
});

const listener = new aws.lb.Listener(`${appName}-listener`, {
  loadBalancerArn: lb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [{
    type: "forward",
    targetGroupArn: targetGroup.arn,
  }],
});

const ecsServiceWithLb = new ImprovedEcsService(`${appName}-lb`, {
  clusterId: cluster.id,
  clusterName: cluster.name,
  vpc: project.vpc,
  containers: [{
    name: 'sample-service',
    image: 'amazon/amazon-ecs-sample',
    portMappings: [ImprovedEcsService.createTcpPortMapping(80)],
  }],
  assignPublicIp: true,
  loadBalancers: [{
    containerName: 'sample-service',
    containerPort: 80,
    targetGroupArn: targetGroup.arn,
  }],
}, { parent: cluster });

const lbUrl = pulumi.interpolate`http://${lb.dnsName}`;

const ecsWithDiscovery = new ImprovedEcsService(`${appName}-sd`, {
  clusterId: cluster.id,
  clusterName: cluster.name,
  vpc: project.vpc,
  containers: [{
    name: 'sample-service',
    image: 'amazon/amazon-ecs-sample',
    portMappings: [ImprovedEcsService.createTcpPortMapping(80)],
    mountPoints: []
  }],
  enableServiceAutoDiscovery: true
  // TODO: Should we connect the parent cluster within the ECS Service component?
}, { parent: cluster });

const ecsServiceWithAutoscaling = new ImprovedEcsService("ecs-test-autoscale", {
  clusterId: cluster.id,
  clusterName: cluster.name,
  vpc: project.vpc,
  containers: [{
    name: "sample-service",
    image: "amazon/amazon-ecs-sample",
    portMappings: [ImprovedEcsService.createTcpPortMapping(80)]
  }],
  autoscaling: {
    enabled: true,
    minCount: 2,
    maxCount: 5
  }
});

const ecsServiceWithStorage = new ImprovedEcsService("ecs-test-storage", {
  clusterId: cluster.id,
  clusterName: cluster.name,
  vpc: project.vpc,
  volumes: [{ name: "data-volume" }],  // Define volume for EFS
  containers: [{
    name: "test-container",
    image: "amazonlinux:2",
    portMappings: [ImprovedEcsService.createTcpPortMapping(80)],
    // Add mount points for the container
    mountPoints: [{
      sourceVolume: "data-volume",
      containerPath: "/data"
    }],
    // Use a command that tests EFS functionality
    // This container will write to EFS, then read from it
    environment: [
      { name: "TEST_FILE", value: "/data/test.txt" }
    ],
    command: [
      "sh",
      "-c",
      "echo 'EFS test content' > $TEST_FILE && " +
      "if [ -f $TEST_FILE ] && grep 'EFS test content' $TEST_FILE; then " +
      "echo 'Successfully wrote to and read from EFS volume'; " +
      "else " +
      "echo 'Failed to write to or read from EFS volume'; " +
      "exit 1; " +
      "fi && " +
      "while true; do sleep 30; done"  // Keep container running for testing
    ]
  }],
});

module.exports = {
  project,
  cluster,
  minimalEcsService,
  ecsServiceWithLb,
  lbUrl,
  ecsWithDiscovery,
  ecsServiceWithAutoscaling,
  ecsServiceWithStorage
};
