import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { next as studion } from '@studion/infra-code-blocks';
import {
  CloudFront,
  BehaviorType,
} from '../../../src/v2/components/cloudfront';
import { AcmCertificate } from '../../../src/components/acm-certificate';
import * as config from './config';
import { OriginFactory } from './origin-factory';

const domainName = process.env.ICB_DOMAIN_NAME!;
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
// const vpc = new studion.Vpc(`${appName}-vpc`, {});
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
// const [customWebsiteBucket, customWebsiteBucketConfig] =
// originFactory.getWebsiteBucket('custom');
// const [s3WebsiteBucket, s3WebsiteBucketConfig] =
//   originFactory.getWebsiteBucket('s3-ws');
// const loadBalancer = originFactory.getLoadBalancer('lb-webserver', vpc.vpc);

const certificate = new AcmCertificate(
  `${config.appName}-acm-certificate`,
  { domain: config.certificateDomain, hostedZoneId: hostedZone.zoneId },
  { parent },
);
// const customCachePolicy = new aws.cloudfront.CachePolicy();
// const customOriginRequestPolicy = new aws.cloudfront.OriginRequestPolicy();
// const customResponseHeadersPolicy = new aws.cloudfront.ResponseHeadersPolicy();

const cfMinimalOriginDomainName = minimalWebsiteBucketConfig.websiteEndpoint;
const cfMinimal = new CloudFront(
  config.cfMinimalName,
  {
    behaviors: [
      {
        type: BehaviorType.CUSTOM,
        pathPattern: '*',
        originId: config.cfMinimalOriginId,
        domainName: cfMinimalOriginDomainName,
        originProtocolPolicy: config.cfMinimalOriginProtocolPolicy,
        defaultRootObject: config.cfMinimalDefaultRootObject,
      },
    ],
    tags: {
      Application: tags.Application,
      Name: config.cfMinimalName,
    },
  },
  { parent },
);
// const cfWithCustomPoliciesBehavior = new CloudFront(
//   `${appName}-custom-policies`,
//   { tags },
//   { parent },
// );
// const cfWithS3WebsiteBehavior = new CloudFront(
//   `${appName}-s3-website`,
//   {
//     behaviors: [
//       {
//         type: BehaviorType.S3,
//         pathPattern: '*',
//         bucket: s3WebsiteBucket,
//         websiteConfig: s3WebsiteBucketConfig,
//       },
//     ],
//     tags,
//   },
//   { parent },
// );
// const cfWithLBBehavior = new CloudFront(`${appName}-lb`, { tags }, { parent });
// const cfWithMultipleBehaviors = new CloudFront(
//   `${appName}-multiple`,
//   { tags },
//   { parent },
// );
const cfWithDomain = new CloudFront(
  `${config.appName}-domain`,
  {
    behaviors: [
      {
        type: BehaviorType.CUSTOM,
        pathPattern: '*',
        originId: config.cfMinimalOriginId,
        domainName: cfMinimalOriginDomainName,
        originProtocolPolicy: config.cfMinimalOriginProtocolPolicy,
        defaultRootObject: config.cfMinimalDefaultRootObject,
      },
    ],
    domain: domainName,
    hostedZoneId: hostedZone.zoneId,
    tags,
  },
  { parent },
);
const cfWithCertificate = new CloudFront(
  `${config.appName}-certificate`,
  {
    behaviors: [
      {
        type: BehaviorType.CUSTOM,
        pathPattern: '*',
        originId: config.cfMinimalOriginId,
        domainName: cfMinimalOriginDomainName,
        originProtocolPolicy: config.cfMinimalOriginProtocolPolicy,
        defaultRootObject: config.cfMinimalDefaultRootObject,
      },
    ],
    certificate: certificate.certificate,
    hostedZoneId: hostedZone.zoneId,
    tags,
  },
  { parent },
);

export {
  // customCachePolicy,
  // customOriginRequestPolicy,
  // customResponseHeadersPolicy,
  cfMinimalOriginDomainName,
  cfMinimal,
  cfWithDomain,
  certificate,
  cfWithCertificate,
  // cfWithCustomPoliciesBehavior,
  // cfWithS3WebsiteBehavior,
  // cfWithLBBehavior,
  // cfWithMultipleBehaviors,
  // cfWithDomain,
  // cfWithSubdomain,
  // cfWithCertificate,
};
