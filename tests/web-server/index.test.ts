import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { InlineProgramArgs } from '@pulumi/pulumi/automation';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeListenersCommand
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { ACMClient } from '@aws-sdk/client-acm';
import { Route53Client } from '@aws-sdk/client-route-53';
import { backOff } from 'exponential-backoff';
import * as path from 'pathe';
import { request } from 'undici';
import status from 'http-status';
import * as automation from '../automation';
import { WebServerTestContext } from './test-context';

const programArgs: InlineProgramArgs = {
  stackName: 'dev',
  projectName: 'icb-test-web-server',
  program: () => import('./infrastructure')
};

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

describe('Web server component deployment', () => {
  const region = process.env.AWS_REGION || 'us-east-2';
  const ctx: WebServerTestContext = {
    outputs: {},
    config: {
      webServerName: 'web-server-example',
      healthCheckPath: '/healthcheck'
    },
    clients: {
      ecs: new ECSClient({ region }),
      ec2: new EC2Client({ region }),
      elb: new ElasticLoadBalancingV2Client({ region }),
      acm: new ACMClient({ region }),
      route53: new Route53Client({ region })
    }
  }

  before(async () => {
    ctx.outputs = await automation.deploy(programArgs);
  });

  after(() => automation.destroy(programArgs));

  it('should create a WebServer with the correct configuration', () => {
    const webServer = ctx.outputs.webServer.value;
    assert.ok(webServer, 'WebServer should be defined');
    assert.strictEqual(
      webServer.name,
      ctx.config.webServerName,
      'WebServer should have correct name'
    );
  });

  it('should create load balancer with correct configuration', async () => {
    const webServer = ctx.outputs.webServer.value;
    assert.ok(webServer.lb.lb, 'Load balancer should be defined');

    const command = new DescribeLoadBalancersCommand({
      LoadBalancerArns: [webServer.lb.lb.arn]
    });
    const response = await ctx.clients.elb.send(command);
    const [lb] = response.LoadBalancers ?? [];

    assert.ok(lb, 'Load balancer should exist in AWS');
    assert.strictEqual(lb.Scheme, 'internet-facing', 'Load balancer should be internet-facing');
    assert.strictEqual(lb.Type, 'application', 'Load balancer should be an application load balancer');
  });

  it('should create target group with correct health check path', async () => {
    const webServer = ctx.outputs.webServer.value;

    const command = new DescribeTargetGroupsCommand({
      TargetGroupArns: [webServer.lb.targetGroup.arn]
    });

    const response = await ctx.clients.elb.send(command);
    const [tg] = response.TargetGroups ?? [];

    assert.ok(tg, 'Target group should exist in AWS');
    assert.strictEqual(
      tg.HealthCheckPath,
      ctx.config.healthCheckPath,
      'Target group should have correct health check path'
    );
  });

  it('should create HTTP listener on port 80', async () => {
    const webServer = ctx.outputs.webServer.value;

    const command = new DescribeListenersCommand({
      ListenerArns: [webServer.lb.httpListener.arn]
    });

    const response = await ctx.clients.elb.send(command);
    const [listener] = response.Listeners ?? [];

    assert.ok(listener, 'HTTP listener should exist in AWS');
    assert.strictEqual(listener.Port, 80, 'HTTP listener should be on port 80');
  });

  it('should create appropriate security groups', async () => {
    const webServer = ctx.outputs.webServer.value;

    const lbSgCommand = new DescribeSecurityGroupsCommand({
      GroupIds: [webServer.lb.securityGroup.id]
    });

    const lbSgResponse = await ctx.clients.ec2.send(lbSgCommand);
    const [lbSg] = lbSgResponse.SecurityGroups ?? [];

    assert.ok(lbSg, 'Load balancer security group should exist');
    const hasHttpTrafficPermission = lbSg.IpPermissions?.some(permission => {
      return permission.FromPort === 80 && permission.ToPort === 80;
    });
    assert.ok(
      hasHttpTrafficPermission,
      'LB security group should allow HTTP traffic'
    );
    const hasTlsTrafficPermission = lbSg.IpPermissions?.some(permission => {
      return permission.FromPort === 443 && permission.ToPort === 443;
    })
    assert.ok(
      hasTlsTrafficPermission,
      'LB security group should allow HTTPS traffic'
    );

    const serviceSgCommand = new DescribeSecurityGroupsCommand({
      GroupIds: [webServer.serviceSecurityGroup.id]
    });

    const serviceSgResponse = await ctx.clients.ec2.send(serviceSgCommand);
    const [serviceSg] = serviceSgResponse.SecurityGroups ?? [];

    assert.ok(serviceSg, 'Service security group should exist');
    const allowsIncomingLbTraffic = serviceSg.IpPermissions?.some(permission => {
      return permission.UserIdGroupPairs?.some(group => {
        return group.GroupId === webServer.lb.securityGroup.id;
      });
    });
    assert.ok(
      allowsIncomingLbTraffic,
      'Service security group should allow traffic from load balancer'
    );
  });

  it('should receive 200 status code from the healthcheck endpoint', () => {
    const webServer = ctx.outputs.webServer.value;
    const webServerLbDns = webServer.lb.lb.dnsName;

    if (!webServerLbDns || typeof webServerLbDns !== 'string') {
      throw new Error(`Invalid load balancer DNS name: ${webServerLbDns}`);
    }

    const webServerUrl = `http://${webServerLbDns}`;

    return backOff(async () => {
      const response = await request(`${webServerUrl}${ctx.config.healthCheckPath}`);
      if (response.statusCode === status.NOT_FOUND) {
        throw new NonRetryableError('Healthcheck endpoint not found');
      }

      const body = await response.body.text();
      assert.strictEqual(
        response.statusCode,
        status.OK,
        `Expected status code 200 but got ${response.statusCode}`
      );
    }, {
      retry: error => !(error instanceof NonRetryableError),
      delayFirstAttempt: true,
      numOfAttempts: 10,
      startingDelay: 1000,
      timeMultiple: 2,
      jitter: 'full'
    });
  });
});
