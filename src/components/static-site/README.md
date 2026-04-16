# `src/components/static-site`

`StaticSite` and `S3Assets` implement the package-standard static-site pattern: a public S3 website bucket delivered through CloudFront.

Use them for documentation sites, front-end applications, and other static assets that need custom-domain support and simple CloudFront cache-rule control.

## Usage examples

### Happy path

```ts
import * as aws from '@pulumi/aws';
import { StaticSite } from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const site = new StaticSite('docs', {
  domain: 'docs.example.com',
  hostedZoneId: hostedZone.zoneId,
});

export const distributionDomain = site.cf.distribution.domainName;
export const bucketName = site.s3Assets.bucket.bucket;
```

### Non-trivial scenario

```ts
import * as aws from '@pulumi/aws';
import { StaticSite } from '@studion/infra-code-blocks';

const hostedZone = aws.route53.getZoneOutput({
  name: 'example.com',
  privateZone: false,
});

const site = new StaticSite('app', {
  domain: 'app.example.com',
  hostedZoneId: hostedZone.zoneId,
  indexDocument: 'home.html',
  errorDocument: 'error.html',
  cacheRules: [
    { pathPattern: '/assets/*', ttl: 'month' },
    { pathPattern: '*', ttl: 'off' },
  ],
});
```

## Implementation notes

- `StaticSite` throws unless either `domain` or `certificate` is provided.
- `StaticSite.Args.hostedZoneId` is currently required for TypeScript callers. `StaticSite` passes it directly to the nested `CloudFront` component, which consumes it for ACM DNS validation and Route53 alias records when it manages custom-domain behavior.
- `StaticSite` delegates domain, certificate, ACM, and Route53 alias handling to the nested `CloudFront` component.
- If JavaScript callers omit `hostedZoneId` at runtime, `CloudFront` throws because custom-domain mode is always enabled for `StaticSite` through the required `domain` or `certificate` input.
- If `cacheRules` is omitted, `StaticSite` creates exactly one default S3 behavior with path pattern `*` and no explicit `cacheTtl` override.
- If `cacheRules` is provided, each rule becomes a CloudFront S3 behavior backed by the same S3 website bucket and website configuration. The rules must still include a default `*` or `/*` behavior last because `CloudFront` enforces that ordering.
- Cache rule TTL presets are translated before reaching CloudFront: `default` becomes `undefined`, `off` becomes `0`, and the other presets become numeric seconds.
- `S3Assets` disables all S3 public access blocking flags and attaches a bucket policy that grants public `s3:GetObject` access to `arn:aws:s3:::<bucket>/*`.
- `S3Assets` creates an S3 website configuration and uses public website endpoints as CloudFront origins, not private S3 REST endpoints.
- `S3Assets` defaults `bucketPrefix` to `${name}-`, and defaults both `indexDocument` and `errorDocument` to `'index.html'`.

## API Reference

### `StaticSite`

**Signature**

```ts
class StaticSite extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: StaticSite.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`StaticSite.Args`               | Direct static-site configuration object.    |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: StaticSite.Args`

| Property                                                           | Description                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `domain`<br/>`pulumi.Input<string>`                                | Custom domain forwarded to the nested `CloudFront` component.                                         |
| `certificate`<br/>`pulumi.Input<aws.acm.Certificate>`              | Existing ACM certificate passed through to the nested `CloudFront`.                                   |
| `hostedZoneId`\*<br/>`pulumi.Input<string>`                        | Hosted zone ID forwarded to the nested `CloudFront` component.                                        |
| `bucketPrefix`<br/>`pulumi.Input<string>`                          | Prefix used for the public website bucket name. Default: `${name}-` in nested `S3Assets`.             |
| `indexDocument`<br/>`pulumi.Input<string>`                         | Website index document key. Default: `'index.html'` in nested `S3Assets`.                             |
| `errorDocument`<br/>`pulumi.Input<string>`                         | Website error document key. Default: `'index.html'` in nested `S3Assets`.                             |
| `cacheRules`<br/>`StaticSite.CacheRule[]`                          | Cache rules translated into CloudFront S3 behaviors for this site. Default: one default `*` behavior. |
| `tags`<br/>`pulumi.Input<{ [key: string]: pulumi.Input<string> }>` | Tags forwarded to both nested components.                                                             |

**Outputs**

| Property                  | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `name`<br/>`string`       | Component name passed to the constructor.                                   |
| `s3Assets`<br/>`S3Assets` | Nested component that owns the public S3 website bucket and website config. |
| `cf`<br/>`CloudFront`     | Nested component that owns the distribution and related edge resources.     |

**Supporting Types**

**`StaticSite.CacheRule`**

```ts
type CacheRule = {
  pathPattern: string;
  ttl: CacheRuleTtl;
};
```

| Property                     | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `pathPattern`\*<br/>`string` | CloudFront path pattern for the generated S3 behavior.  |
| `ttl`\*<br/>`CacheRuleTtl`   | Numeric TTL in seconds or one of the named TTL presets. |

**`CacheRuleTtl`**

```ts
type CacheRuleTtl =
  | number
  | 'default'
  | 'off'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month';
```

| Value       | Resolved TTL | Description                                                                |
| ----------- | ------------ | -------------------------------------------------------------------------- |
| `'default'` | `undefined`  | Leaves `cacheTtl` unset so the nested CloudFront S3 behavior uses defaults |
| `'off'`     | `0`          | Disables caching                                                           |
| `'minute'`  | `60`         | One minute                                                                 |
| `'hour'`    | `3600`       | One hour                                                                   |
| `'day'`     | `86400`      | One day                                                                    |
| `'week'`    | `604800`     | One week                                                                   |
| `'month'`   | `2592000`    | Thirty days                                                                |
| `number`    | direct value | Explicit TTL in seconds passed directly to the generated `cacheTtl`        |

### `S3Assets`

**Signature**

```ts
class S3Assets extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: S3Assets.Args,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                 |
| -------------------------------------------- | ------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.              |
| `args`\*<br/>`S3Assets.Args`                 | Direct S3 assets configuration object.      |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options. |

**Configuration Options**

Direct constructor input: `args: S3Assets.Args`

| Property                                                           | Description                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `bucketPrefix`<br/>`pulumi.Input<string>`                          | Prefix used for the S3 website bucket name. Default: `${name}-`. |
| `indexDocument`<br/>`pulumi.Input<string>`                         | Website index document suffix. Default: `'index.html'`.          |
| `errorDocument`<br/>`pulumi.Input<string>`                         | Website error document key. Default: `'index.html'`.             |
| `tags`<br/>`pulumi.Input<{ [key: string]: pulumi.Input<string> }>` | Extra tags merged with `commonTags` on the website bucket.       |

**Outputs**

| Property                                                | Description                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `name`<br/>`string`                                     | Component name passed to the constructor.                            |
| `bucket`<br/>`aws.s3.Bucket`                            | Public S3 website bucket used as the origin content store.           |
| `websiteConfig`<br/>`aws.s3.BucketWebsiteConfiguration` | Website hosting configuration that supplies the S3 website endpoint. |
