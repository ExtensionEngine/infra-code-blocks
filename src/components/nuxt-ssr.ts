import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as random from '@pulumi/random';
import { commonTags } from '../constants';
import { AcmCertificate } from './acm-certificate';
import { EcsService, EcsServiceArgs } from './ecs-service';

export type NuxtSSRArgs = Pick<
  EcsServiceArgs,
  | 'image'
  | 'port'
  | 'cluster'
  | 'vpc'
  | 'desiredCount'
  | 'autoscaling'
  | 'size'
  | 'environment'
  | 'secrets'
  | 'tags'
> & {
  /**
   * The domain which will be used to access the service.
   * The domain or subdomain must belong to the provided hostedZone.
   */
  domain?: pulumi.Input<string>;
  /**
   * The ID of the hosted zone.
   */
  hostedZoneId?: pulumi.Input<string>;
  /**
   * Path for the health check request. Defaults to "/".
   */
  healthCheckPath?: pulumi.Input<string>;
};

const defaults = {
  healthCheckPath: '/',
};

export class NuxtSSR extends pulumi.ComponentResource {
  name: string;
  service: EcsService;
  certificate?: AcmCertificate;
  lbSecurityGroup: aws.ec2.SecurityGroup;
  serviceSecurityGroup: aws.ec2.SecurityGroup;
  customCFHeader: { name: pulumi.Output<string>; value: pulumi.Output<string> };
  lb: aws.lb.LoadBalancer;
  lbTargetGroup: aws.lb.TargetGroup;
  lbHttpListener: aws.lb.Listener;
  cloudfront: aws.cloudfront.Distribution;

  constructor(
    name: string,
    args: NuxtSSRArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super('studion:NuxtSSR', name, args, opts);

    const { vpc, port, healthCheckPath, domain, hostedZoneId, tags } = args;
    const hasCustomDomain = domain && hostedZoneId;
    if (domain && !hostedZoneId) {
      throw new Error(
        'NuxtSSR:hostedZoneId must be provided when the domain is specified',
      );
    }

    this.name = name;

    if (hasCustomDomain) {
      this.certificate = this.createTlsCertificate({ domain, hostedZoneId });
    }

    this.customCFHeader = this.createCustomCFHeader();
    const { lb, lbTargetGroup, lbHttpListener, lbSecurityGroup } =
      this.createLoadBalancer({ vpc, port, healthCheckPath });
    this.lb = lb;
    this.lbTargetGroup = lbTargetGroup;
    this.lbHttpListener = lbHttpListener;
    this.lbSecurityGroup = lbSecurityGroup;
    this.serviceSecurityGroup = this.createSecurityGroup({ vpc });
    this.service = this.createEcsService(args);
    this.cloudfront = this.createCloudfrontDistribution({ domain, tags });

    if (hasCustomDomain) {
      this.createDnsRecord({ domain, hostedZoneId });
    }

    this.registerOutputs();
  }

  private createTlsCertificate({
    domain,
    hostedZoneId,
  }: Pick<Required<NuxtSSRArgs>, 'domain' | 'hostedZoneId'>) {
    const certificate = new AcmCertificate(
      `${domain}-acm-certificate`,
      {
        domain,
        hostedZoneId,
      },
      { parent: this },
    );
    return certificate;
  }

  private createCustomCFHeader() {
    const headerNameOpts = {
      length: 4,
      special: false,
      numeric: false,
      lower: false,
      upper: true,
    };
    const headerNameSegment1 = new random.RandomString(
      `${this.name}-cf-header-name-segment1`,
      headerNameOpts,
    );
    const headerNameSegment2 = new random.RandomString(
      `${this.name}-cf-header-name-segment2`,
      headerNameOpts,
    );
    const headerValue = new random.RandomString(
      `${this.name}-cf-header-value`,
      {
        length: 36,
        special: false,
        numeric: true,
        lower: true,
        upper: true,
      },
    );
    const headerName = pulumi
      .all([headerNameSegment1.result, headerNameSegment2.result])
      .apply(([segment1, segment2]) => {
        return `X-${segment1}-${segment2}`;
      });
    return { name: headerName, value: headerValue.result };
  }

  private createLoadBalancer({
    vpc,
    port,
    healthCheckPath,
  }: Pick<NuxtSSRArgs, 'vpc' | 'port' | 'healthCheckPath'>) {
    const lbSecurityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-lb-security-group`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
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
        tags: commonTags,
      },
      { parent: this },
    );

    const lb = new aws.lb.LoadBalancer(
      `${this.name}-lb`,
      {
        namePrefix: 'lb-',
        loadBalancerType: 'application',
        subnets: vpc.publicSubnetIds,
        securityGroups: [lbSecurityGroup.id],
        internal: false,
        ipAddressType: 'ipv4',
        tags: { ...commonTags, Name: `${this.name}-lb` },
      },
      { parent: this },
    );

    const lbTargetGroup = new aws.lb.TargetGroup(
      `${this.name}-lb-tg`,
      {
        namePrefix: 'lb-tg-',
        port,
        protocol: 'HTTP',
        targetType: 'ip',
        vpcId: vpc.vpcId,
        healthCheck: {
          healthyThreshold: 3,
          unhealthyThreshold: 2,
          interval: 60,
          timeout: 5,
          path: healthCheckPath || defaults.healthCheckPath,
        },
        tags: { ...commonTags, Name: `${this.name}-lb-target-group` },
      },
      { parent: this, dependsOn: [this.lb] },
    );

    const lbHttpListener = new aws.lb.Listener(
      `${this.name}-lb-listener-80`,
      {
        loadBalancerArn: lb.arn,
        port: 80,
        defaultActions: [
          {
            type: 'fixed-response',
            fixedResponse: {
              statusCode: '403',
              messageBody: 'Not Allowed',
              contentType: 'text/plain',
            },
          },
        ],
        tags: commonTags,
      },
      { parent: this },
    );

    const lbHttpListenerRule = new aws.lb.ListenerRule(
      `${this.name}-lb-listener-rule`,
      {
        listenerArn: lbHttpListener.arn,
        priority: 1,
        actions: [
          {
            type: 'forward',
            targetGroupArn: lbTargetGroup.arn,
          },
        ],
        conditions: [
          {
            httpHeader: {
              httpHeaderName: this.customCFHeader.name,
              values: [this.customCFHeader.value],
            },
          },
        ],
      },
    );

    return {
      lb,
      lbTargetGroup,
      lbHttpListener,
      lbSecurityGroup,
    };
  }

  private createSecurityGroup({ vpc }: Pick<NuxtSSRArgs, 'vpc'>) {
    const securityGroup = new aws.ec2.SecurityGroup(
      `${this.name}-security-group`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            fromPort: 0,
            toPort: 0,
            protocol: '-1',
            securityGroups: [this.lbSecurityGroup.id],
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
        tags: commonTags,
      },
      { parent: this },
    );
    return securityGroup;
  }

  private createEcsService(args: NuxtSSRArgs) {
    const service = new EcsService(
      this.name,
      {
        ...args,
        enableServiceAutoDiscovery: false,
        lbTargetGroupArn: this.lbTargetGroup.arn,
        assignPublicIp: true,
        securityGroup: this.serviceSecurityGroup,
      },
      {
        parent: this,
        dependsOn: [this.lb, this.lbTargetGroup, this.lbHttpListener],
      },
    );
    return service;
  }

  private createCloudfrontDistribution({
    domain,
    tags,
  }: Pick<NuxtSSRArgs, 'domain' | 'tags'>) {
    const cachePolicy = new aws.cloudfront.CachePolicy(
      `${this.name}-cf-cache-policy`,
      {
        comment:
          'This cache policy is managed by Pulumi, changing its values will impact multiple services.',
        defaultTtl: 0,
        maxTtl: 31536000,
        minTtl: 0,
        parametersInCacheKeyAndForwardedToOrigin: {
          cookiesConfig: {
            cookieBehavior: 'none',
          },
          headersConfig: {
            headerBehavior: 'none',
          },
          queryStringsConfig: {
            queryStringBehavior: 'all',
          },
        },
      },
    );

    const originRequestPolicyId = aws.cloudfront
      .getOriginRequestPolicyOutput({
        name: 'Managed-AllViewer',
      })
      .apply(policy => policy.id!);

    const responseHeadersPolicyId = aws.cloudfront
      .getResponseHeadersPolicyOutput({
        name: 'Managed-SecurityHeadersPolicy',
      })
      .apply(policy => policy.id!);

    const cloudfront = new aws.cloudfront.Distribution(
      `${this.name}-cloudfront`,
      {
        enabled: true,
        ...(domain && { aliases: [domain] }),
        isIpv6Enabled: true,
        waitForDeployment: true,
        httpVersion: 'http2and3',
        viewerCertificate: {
          ...(this.certificate
            ? {
                acmCertificateArn: this.certificate.certificate.arn,
                sslSupportMethod: 'sni-only',
                minimumProtocolVersion: 'TLSv1.2_2021',
              }
            : {
                cloudfrontDefaultCertificate: true,
              }),
        },
        origins: [
          {
            originId: this.lb.arn,
            domainName: this.lb.dnsName,
            connectionAttempts: 3,
            connectionTimeout: 10,
            customOriginConfig: {
              originProtocolPolicy: 'http-only',
              httpPort: 80,
              httpsPort: 443,
              originSslProtocols: ['SSLv3'],
            },
            customHeaders: [
              { name: 'X-Forwarded-Port', value: '443' },
              { name: 'X-Forwarded-Ssl', value: 'on' },
              this.customCFHeader,
            ],
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: this.lb.arn,
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: [
            'GET',
            'HEAD',
            'OPTIONS',
            'PUT',
            'POST',
            'PATCH',
            'DELETE',
          ],
          cachedMethods: ['GET', 'HEAD'],
          compress: true,
          cachePolicyId: cachePolicy.id,
          originRequestPolicyId,
          responseHeadersPolicyId,
        },
        priceClass: 'PriceClass_100',
        restrictions: {
          geoRestriction: { restrictionType: 'none' },
        },
        tags: { ...commonTags, ...tags },
      },
      { parent: this },
    );
    return cloudfront;
  }

  private createDnsRecord({
    domain,
    hostedZoneId,
  }: Pick<Required<NuxtSSRArgs>, 'domain' | 'hostedZoneId'>) {
    const cdnAliasRecord = new aws.route53.Record(
      `${this.name}-cdn-route53-record`,
      {
        type: 'A',
        name: domain,
        zoneId: hostedZoneId,
        aliases: [
          {
            name: this.cloudfront.domainName,
            zoneId: this.cloudfront.hostedZoneId,
            evaluateTargetHealth: true,
          },
        ],
      },
      { parent: this },
    );
    return cdnAliasRecord;
  }
}
