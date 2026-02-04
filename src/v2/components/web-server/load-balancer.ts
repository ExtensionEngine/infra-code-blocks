import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-v7';
import * as awsx from '@pulumi/awsx-v3';
import { commonTags } from '../../../constants';
import { mergeWithDefaults } from '../../shared/merge-with-defaults';

export namespace WebServerLoadBalancer {
  export type Args = {
    vpc: pulumi.Input<awsx.ec2.Vpc>;
    port: pulumi.Input<number>;
    certificate?: pulumi.Input<aws.acm.Certificate>;
    healthCheckPath?: pulumi.Input<string>;
    loadBalancingAlgorithmType?: pulumi.Input<string>;
  };
}

const webServerLoadBalancerNetworkConfig = {
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      cidrBlocks: ['0.0.0.0/0'],
    },
    {
      protocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
};

const defaults = {
  healthCheckPath: '/healthcheck',
};

export class WebServerLoadBalancer extends pulumi.ComponentResource {
  name: string;
  lb: aws.lb.LoadBalancer;
  targetGroup: aws.lb.TargetGroup;
  httpListener: aws.lb.Listener;
  tlsListener: aws.lb.Listener | undefined;
  securityGroup: aws.ec2.SecurityGroup;

  constructor(
    name: string,
    args: WebServerLoadBalancer.Args,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:WebServerLoadBalancer', name, args, opts);

    this.name = name;
    const vpc = pulumi.output(args.vpc);
    const argsWithDefaults = mergeWithDefaults(defaults, args);
    const { port, certificate, healthCheckPath, loadBalancingAlgorithmType } =
      argsWithDefaults;

    this.securityGroup = this.createLbSecurityGroup(vpc.vpcId);

    this.lb = new aws.lb.LoadBalancer(
      this.name,
      {
        namePrefix: 'lb-',
        loadBalancerType: 'application',
        subnets: vpc.publicSubnetIds,
        securityGroups: [this.securityGroup.id],
        internal: false,
        ipAddressType: 'ipv4',
        tags: { ...commonTags, Name: name },
      },
      { parent: this },
    );

    this.targetGroup = this.createLbTargetGroup(
      port,
      vpc.vpcId,
      healthCheckPath,
      loadBalancingAlgorithmType,
    );
    this.httpListener = this.createLbHttpListener(
      this.lb,
      this.targetGroup,
      !!certificate,
    );
    this.tlsListener =
      certificate &&
      this.createLbTlsListener(
        this.lb,
        this.targetGroup,
        pulumi.output(certificate),
      );

    this.registerOutputs();
  }

  private createLbTlsListener(
    lb: aws.lb.LoadBalancer,
    lbTargetGroup: aws.lb.TargetGroup,
    certificate: pulumi.Output<aws.acm.Certificate>,
  ): aws.lb.Listener {
    return new aws.lb.Listener(
      `${this.name}-listener-443`,
      {
        loadBalancerArn: lb.arn,
        port: 443,
        protocol: 'HTTPS',
        sslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
        certificateArn: certificate.arn,
        defaultActions: [
          {
            type: 'forward',
            targetGroupArn: lbTargetGroup.arn,
          },
        ],
        tags: commonTags,
      },
      { parent: this, dependsOn: [certificate] },
    );
  }

  private createLbHttpListener(
    lb: aws.lb.LoadBalancer,
    lbTargetGroup: aws.lb.TargetGroup,
    redirectToHttps: boolean,
  ): aws.lb.Listener {
    const httpsRedirectAction = {
      type: 'redirect',
      redirect: {
        port: '443',
        protocol: 'HTTPS',
        statusCode: 'HTTP_301',
      },
    };
    const defaultAction = redirectToHttps
      ? httpsRedirectAction
      : {
          type: 'forward',
          targetGroupArn: lbTargetGroup.arn,
        };

    return new aws.lb.Listener(
      `${this.name}-listener-80`,
      {
        loadBalancerArn: lb.arn,
        port: 80,
        defaultActions: [defaultAction],
        tags: commonTags,
      },
      { parent: this },
    );
  }

  private createLbTargetGroup(
    port: pulumi.Input<number>,
    vpcId: awsx.ec2.Vpc['vpcId'],
    healthCheckPath: pulumi.Input<string>,
    loadBalancingAlgorithmType?: pulumi.Input<string>,
  ): aws.lb.TargetGroup {
    return new aws.lb.TargetGroup(
      `${this.name}-tg`,
      {
        namePrefix: 'lb-tg-',
        port,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId,
        loadBalancingAlgorithmType,
        healthCheck: {
          healthyThreshold: 3,
          unhealthyThreshold: 2,
          interval: 60,
          timeout: 5,
          path: healthCheckPath,
        },
        tags: { ...commonTags, Name: `${this.name}-target-group` },
      },
      { parent: this, dependsOn: [this.lb] },
    );
  }

  private createLbSecurityGroup(
    vpcId: awsx.ec2.Vpc['vpcId'],
  ): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        ...webServerLoadBalancerNetworkConfig,
        vpcId,
        tags: commonTags,
      },
      { parent: this },
    );
  }
}
