# `src/components/cloudfront`

`CloudFront` turns an ordered list of typed S3, load-balancer, and custom-origin behaviors into a CloudFront distribution.

Use it when you want origin wiring, cache behavior generation, optional `us-east-1` ACM bootstrapping, and Route53 aliases handled together for package-standard edge delivery.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const assets = new studion.S3Assets('docs-assets', {});

const cdn = new studion.CloudFront('docs-cdn', {
  domain: 'docs.example.com',
  hostedZoneId: hostedZone.zoneId,
  behaviors: [
    {
      type: studion.CloudFront.BehaviorType.S3,
      pathPattern: '*',
      bucket: assets.bucket,
      websiteConfig: assets.websiteConfig,
    },
  ],
});

export const distributionDomainName = cdn.distribution.domainName;
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const vpc = new studion.Vpc('app', {});

const loadBalancer = new aws.lb.LoadBalancer('app-lb', {
  loadBalancerType: 'application',
  subnets: vpc.vpc.publicSubnetIds,
});

const cdn = new studion.CloudFront('app-cdn', {
  domain: 'app.example.com',
  hostedZoneId: hostedZone.zoneId,
  behaviors: [
    {
      type: studion.CloudFront.BehaviorType.LB,
      pathPattern: '/api/*',
      loadBalancer,
    },
    {
      type: studion.CloudFront.BehaviorType.CUSTOM,
      pathPattern: '*',
      originId: 'app-origin',
      domainName: 'origin.example.com',
      defaultRootObject: 'index.html',
    },
  ],
});

export const aliases = cdn.distribution.aliases;
```

## Implementation notes

- The default behavior must be the last entry in `behaviors`; otherwise construction throws. A behavior is considered default only when its `pathPattern` is `'*'` or `'/*'`.
- All generated cache behaviors use `viewerProtocolPolicy: 'redirect-to-https'`.
- S3-backed behaviors use `websiteConfig.websiteEndpoint`, so the origin is a public website-style S3 endpoint rather than a private bucket with Origin Access Control.
- S3 cache strategies allow only `GET`/`HEAD`, enable compression, create a cache policy, and attach response headers that set `Cache-Control: no-cache` plus security headers.
- When an S3 `cacheTtl` override is provided, it is used for default, minimum, and maximum TTL. Without an override the S3 policy uses default/min/max TTLs of one day, one minute, and one year.
- Load-balancer behaviors allow all common HTTP methods, cache `GET`/`HEAD`/`OPTIONS`, forward all viewer values with the managed `Managed-AllViewer` origin request policy, and use a no-store response header policy.
- Custom behaviors default to `Managed-CachingDisabled`, use `Managed-SecurityHeadersPolicy`, and use `Managed-AllViewerExceptHostHeader` for non-S3 origins unless you provide explicit policy IDs.
- Duplicate origins are removed by `originId`, and the last origin definition with a given ID wins.
- Generated origins use HTTP port `80`, HTTPS port `443`, and `originSslProtocols: ['TLSv1.2']`; S3 website origins use `originProtocolPolicy: 'http-only'`, while load-balancer and custom origins default to `https-only` unless a custom behavior overrides `originProtocolPolicy`.
- `hostedZoneId` is required whenever `domain` or `certificate` is provided.
- If `domain` is provided without `certificate`, the component creates an ACM certificate in `us-east-1` for CloudFront and waits for validation before creating the distribution.
- When you provide `domain` or `certificate`, the viewer certificate uses `minimumProtocolVersion: 'TLSv1.2_2021'`.
- When you provide `certificate` without `domain`, CloudFront aliases and Route53 alias records are created for the certificate's `domainName` and `subjectAlternativeNames`.
- `defaultRootObject` for S3 behaviors is always set to `index.html` and for Custom behaviors to the caller-provided value. Load balancer behaviors do not set `defaultRootObject`.
- The distribution is opinionated: `enabled`, `isIpv6Enabled`, `waitForDeployment`, `httpVersion: 'http2and3'`, `priceClass: 'PriceClass_100'`, and no geo restriction are hard-coded.

## API Reference

### `CloudFront`

**Signature**

```ts
class CloudFront extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: CloudFront.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`CloudFront.Args`               | Direct CloudFront configuration object.     |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: CloudFront.Args`

| Property                                                        | Description                                                                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `behaviors`\*<br/>`CloudFront.Behavior[]`                       | Ordered behavior list. The default behavior (`*` or `/*`) must be last.                                                                                          |
| `domain`<br/>`pulumi.Input<string>`                             | Custom alias domain. When set without `certificate`, the component creates an `AcmCertificate` in `us-east-1`.                                                   |
| `certificate`<br/>`pulumi.Input<aws.acm.Certificate>`           | Existing ACM certificate. If `domain` is omitted, aliases are derived from the certificate domains. Wildcard-certificate consumers should also provide `domain`. |
| `hostedZoneId`<br/>`pulumi.Input<string>`                       | Required: when `domain` or `certificate` is provided.                                                                                                            |
| `tags`<br/>`pulumi.Input<Record<string, pulumi.Input<string>>>` | Extra tags merged with the package `commonTags`.                                                                                                                 |

**Outputs**

| Property                                           | Description                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `name`<br/>`string`                                | Component name passed to the constructor.                                     |
| `distribution`<br/>`aws.cloudfront.Distribution`   | Primary CloudFront distribution resource configured from the behavior list.   |
| `acmCertificate`<br/>`AcmCertificate \| undefined` | Auto-created ACM certificate when `domain` is provided without `certificate`. |

**Supporting Types**

**`CloudFront.BehaviorType`**

```ts
enum BehaviorType {
  S3 = 's3',
  LB = 'lb',
  CUSTOM = 'custom',
}
```

**`CloudFront.Behavior`**

```ts
type Behavior =
  | CloudFront.S3Behavior
  | CloudFront.LbBehavior
  | CloudFront.CustomBehavior;
```

**`CloudFront.S3Behavior`**

```ts
type S3Behavior = {
  type: CloudFront.BehaviorType.S3;
  pathPattern: string;
  bucket: pulumi.Input<aws.s3.Bucket>;
  websiteConfig: pulumi.Input<aws.s3.BucketWebsiteConfiguration>;
  cacheTtl?: pulumi.Input<number>;
};
```

| Property                                                                | Description                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`\*<br/>`CloudFront.BehaviorType.S3`                               | Selects S3 website-origin behavior mapping.                                                                                                                                                                             |
| `pathPattern`\*<br/>`string`                                            | CloudFront path pattern. Use `*` or `/*` for the default behavior.                                                                                                                                                      |
| `bucket`\*<br/>`pulumi.Input<aws.s3.Bucket>`                            | Bucket whose ARN becomes the origin ID.                                                                                                                                                                                 |
| `websiteConfig`\*<br/>`pulumi.Input<aws.s3.BucketWebsiteConfiguration>` | Source of the website endpoint used as the origin domain name.                                                                                                                                                          |
| `cacheTtl`<br/>`pulumi.Input<number>`                                   | When provided, the same TTL value is applied to all three S3 cache policy TTL fields. `0` also disables Brotli and Gzip accept-encoding flags in the generated cache policy. Default: `86400` / `60` / `31536000` TTLs. |

**`CloudFront.LbBehavior`**

```ts
type LbBehavior = {
  type: CloudFront.BehaviorType.LB;
  pathPattern: string;
  loadBalancer: pulumi.Input<aws.lb.LoadBalancer>;
  dnsName?: pulumi.Input<string>;
};
```

| Property                                                 | Description                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `type`\*<br/>`CloudFront.BehaviorType.LB`                | Selects load-balancer origin behavior mapping.                     |
| `pathPattern`\*<br/>`string`                             | CloudFront path pattern. Use `*` or `/*` for the default behavior. |
| `loadBalancer`\*<br/>`pulumi.Input<aws.lb.LoadBalancer>` | Load balancer whose ARN becomes the origin ID.                     |
| `dnsName`<br/>`pulumi.Input<string>`                     | Optional origin domain override. Default: `loadBalancer.dnsName`.  |

**`CloudFront.CustomBehavior`**

```ts
type CustomBehavior = {
  type: CloudFront.BehaviorType.CUSTOM;
  pathPattern: string;
  originId: pulumi.Input<string>;
  domainName: pulumi.Input<string>;
  originProtocolPolicy?: pulumi.Input<string>;
  allowedMethods?: pulumi.Input<pulumi.Input<string>[]>;
  cachedMethods?: pulumi.Input<pulumi.Input<string>[]>;
  compress?: pulumi.Input<boolean>;
  defaultRootObject?: pulumi.Input<string>;
  cachePolicyId?: pulumi.Input<string>;
  originRequestPolicyId?: pulumi.Input<string>;
  responseHeadersPolicyId?: pulumi.Input<string>;
};
```

| Property                                                    | Description                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`\*<br/>`CloudFront.BehaviorType.CUSTOM`               | Selects caller-defined custom origin behavior mapping.                                                                                         |
| `pathPattern`\*<br/>`string`                                | CloudFront path pattern. Use `*` or `/*` for the default behavior.                                                                             |
| `originId`\*<br/>`pulumi.Input<string>`                     | CloudFront origin ID. Duplicate IDs are deduplicated later.                                                                                    |
| `domainName`\*<br/>`pulumi.Input<string>`                   | Origin hostname.                                                                                                                               |
| `originProtocolPolicy`<br/>`pulumi.Input<string>`           | Override for the generated custom origin protocol policy. Default: `'https-only'`.                                                             |
| `allowedMethods`<br/>`pulumi.Input<pulumi.Input<string>[]>` | Default depends on whether `domainName` matches the built-in S3 domain regex. Default: S3 domains: `GET`/`HEAD`; otherwise all common methods. |
| `cachedMethods`<br/>`pulumi.Input<pulumi.Input<string>[]>`  | Cached methods passed to the cache behavior. Default: `['GET', 'HEAD']`.                                                                       |
| `compress`<br/>`pulumi.Input<boolean>`                      | Only set on the behavior when explicitly provided. Default: unset.                                                                             |
| `defaultRootObject`<br/>`pulumi.Input<string>`              | Only used when this behavior is also the default behavior.                                                                                     |
| `cachePolicyId`<br/>`pulumi.Input<string>`                  | Override for the cache policy. Default: `Managed-CachingDisabled` policy.                                                                      |
| `originRequestPolicyId`<br/>`pulumi.Input<string>`          | Override for the origin request policy. Default: S3 domains: none; otherwise `Managed-AllViewerExceptHostHeader` policy.                       |
| `responseHeadersPolicyId`<br/>`pulumi.Input<string>`        | Override for the response headers policy. Default: `Managed-SecurityHeadersPolicy` policy.                                                     |
