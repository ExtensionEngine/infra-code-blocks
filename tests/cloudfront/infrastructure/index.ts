import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';
import { CloudFront } from '../../../src/v2/components/cloudfront';
import { AcmCertificate } from '../../../src/v2/components/acm-certificate';
import * as config from './config';
import { OriginFactory } from './origin-factory';

const hostedZoneId = process.env.ICB_HOSTED_ZONE_ID;
const tags = {
  Project: pulumi.getProject(),
  Environment: pulumi.getStack(),
  Application: config.appName,
};

const parent = new pulumi.ComponentResource(
  'studion:cf:TestGroup',
  `${config.appName}-root`,
);
const vpc = new studion.Vpc(`${config.appName}-vpc`, {}, { parent });
const hostedZone = aws.route53.getZoneOutput({
  zoneId: hostedZoneId,
});

const originFactory = new OriginFactory({
  namePrefix: config.appName,
  parent,
  tags,
});

const [, minimalWebsiteBucketConfig] =
  originFactory.getWebsiteBucket('minimal');
const [customWebsiteBucket, customWebsiteBucketConfig] =
  originFactory.getWebsiteBucket('custom');
const [s3WebsiteBucket, s3WebsiteBucketConfig] = originFactory.getWebsiteBucket(
  's3-site',
  'www/',
);
const loadBalancer = originFactory.getLoadBalancer(
  'ws',
  vpc.vpc,
  config.loadBalancerDomain,
  hostedZone.zoneId,
);

const certificate = new AcmCertificate(
  `${config.appName}-acm-certificate`,
  {
    domain: config.certificateDomain,
    subjectAlternativeNames: config.certificateSANs,
    hostedZoneId: hostedZone.zoneId,
    region: 'us-east-1',
  },
  { parent },
);
const customCachePolicy = new aws.cloudfront.CachePolicy(
  `${config.appName}-custom-cp`,
  {
    name: `${config.appName}-custom-cache-policy`,
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
      enableAcceptEncodingGzip: true,
    },
    minTtl: 1,
    defaultTtl: 60,
    maxTtl: 600,
  },
  { parent },
);
const customOriginRequestPolicy = new aws.cloudfront.OriginRequestPolicy(
  `${config.appName}-custom-orp`,
  {
    name: `${config.appName}-custom-request-policy`,
    cookiesConfig: {
      cookieBehavior: 'all',
    },
    headersConfig: {
      headerBehavior: 'none',
    },
    queryStringsConfig: {
      queryStringBehavior: 'all',
    },
  },
  { parent },
);
const customResponseHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy(
  `${config.appName}-custom-rsp`,
  {
    name: `${config.appName}-custom-headers-policy`,
    customHeadersConfig: {
      items: [
        {
          header: 'X-Allowed-Cross-Domains',
          value: 'none',
          override: true,
        },
      ],
    },
  },
  { parent },
);

const cfMinimalOriginDomainName = minimalWebsiteBucketConfig.websiteEndpoint;
const cfMinimalBehavior: CloudFront.Behavior = {
  type: CloudFront.BehaviorType.CUSTOM,
  pathPattern: '*',
  originId: config.cfMinimalOriginId,
  domainName: cfMinimalOriginDomainName,
  originProtocolPolicy: config.cfMinimalOriginProtocolPolicy,
  defaultRootObject: config.cfMinimalDefaultRootObject,
};
const cfMinimal = new CloudFront(
  config.cfMinimalName,
  {
    behaviors: [{ ...cfMinimalBehavior }],
    tags: {
      Application: tags.Application,
      Name: config.cfMinimalName,
    },
  },
  { parent },
);
const cfWithDomain = new CloudFront(
  `${config.appName}-domain`,
  {
    behaviors: [{ ...cfMinimalBehavior }],
    domain: config.defaultDomain,
    hostedZoneId: hostedZone.zoneId,
    tags,
  },
  { parent },
);
const cfWithCertificate = new CloudFront(
  `${config.appName}-certificate`,
  {
    behaviors: [{ ...cfMinimalBehavior }],
    certificate: certificate.certificate,
    hostedZoneId: hostedZone.zoneId,
    tags,
  },
  { parent },
);
const cfWithVariousBehaviors = new CloudFront(
  `${config.appName}-various-behaviors`,
  {
    behaviors: [
      {
        type: CloudFront.BehaviorType.LB,
        pathPattern: config.cfWithVariousBehaviorsLbPathPattern,
        loadBalancer,
        dnsName: config.loadBalancerDomain,
      },
      {
        type: CloudFront.BehaviorType.S3,
        pathPattern: config.cfWithVariousBehaviorsS3PathPattern,
        bucket: s3WebsiteBucket,
        websiteConfig: s3WebsiteBucketConfig,
      },
      {
        type: CloudFront.BehaviorType.CUSTOM,
        pathPattern: '*',
        originId: customWebsiteBucket.id,
        domainName: customWebsiteBucketConfig.websiteEndpoint,
        originProtocolPolicy:
          config.cfWithVariousBehaviorsCustomOriginProtocolPolicy,
        defaultRootObject: config.cfWithVariousBehaviorsCustomDefaultRootObject,
        allowedMethods: config.cfWithVariousBehaviorsCustomAllowedMethods,
        compress: config.cfWithVariousBehaviorsCustomCompress,
        cachePolicyId: customCachePolicy.id,
        originRequestPolicyId: customOriginRequestPolicy.id,
        responseHeadersPolicyId: customResponseHeadersPolicy.id,
      },
    ],
    tags,
  },
  { parent },
);

export {
  cfMinimalOriginDomainName,
  cfMinimal,
  cfWithDomain,
  certificate,
  cfWithCertificate,
  loadBalancer,
  s3WebsiteBucket,
  s3WebsiteBucketConfig,
  customWebsiteBucket,
  customWebsiteBucketConfig,
  customCachePolicy,
  customOriginRequestPolicy,
  customResponseHeadersPolicy,
  cfWithVariousBehaviors,
};
