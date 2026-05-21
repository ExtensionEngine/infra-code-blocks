# `src/components/vpc`

`Vpc` wraps `awsx.ec2.Vpc` with the package-standard three-tier topology: private, public, and isolated subnets with DNS support enabled.

Use it as the shared networking foundation for components such as `Database`, `EcsService`, `ElastiCacheRedis`, and `WebServer` when you want consistent VPC defaults across stacks.

## Usage examples

### Happy path

```ts
import { Vpc } from '@studion/infra-code-blocks';

const vpc = new Vpc('app');

export const vpcId = vpc.vpc.vpcId;
```

### Non-trivial scenario

```ts
import { Vpc } from '@studion/infra-code-blocks';

const vpc = new Vpc('platform', {
  numberOfAvailabilityZones: 3,
  tags: {
    Owner: 'platform-team',
  },
});

export const publicSubnetIds = vpc.vpc.publicSubnetIds;
export const isolatedSubnetIds = vpc.vpc.isolatedSubnetIds;
```

## Implementation notes

- `Vpc` is a thin component wrapper around one nested `awsx.ec2.Vpc` resource and exposes that AWSX instance as `vpc.vpc`.
- Intentionally allows configuration of only `numberOfAvailabilityZones` and `tags`; CIDR ranges, NAT gateway behavior, subnet names, route tables, and the broader AWSX VPC surface are not configurable here.
- The component merges caller input with `defaults.numberOfAvailabilityZones = 2` before creating the AWSX VPC.
- DNS support and DNS hostnames are always enabled.
- The subnet allocation strategy is `enums.ec2.SubnetAllocationStrategy.Auto`.
- Subnet specs are explicitly ordered as private, public, then isolated to preserve compatibility with earlier AWSX `Legacy` ordering.
- Each subnet spec uses `cidrMask: 24`, so every selected availability zone gets one private, one public, and one isolated `/24` subnet from the AWSX-generated VPC CIDR plan.

## API Reference

### `Vpc`

**Signature**

```ts
class Vpc extends pulumi.ComponentResource {
  constructor(
    name: string,
    args: VpcArgs,
    opts?: pulumi.ComponentResourceOptions,
  );
}
```

**Constructor Parameters**

| Parameter                                    | Description                                     |
| -------------------------------------------- | ----------------------------------------------- |
| `name`\*<br/>`string`                        | Logical Pulumi component name.                  |
| `args`<br/>`Vpc.Args`                        | Direct VPC configuration object. Default: `{}`. |
| `opts`<br/>`pulumi.ComponentResourceOptions` | Optional Pulumi component resource options.     |

**Configuration Options**

Direct constructor input: `args: Vpc.Args`

| Property                                                           | Description                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `numberOfAvailabilityZones`<br/>`number`                           | Number of availability zones used by the AWSX VPC. Default: `2`. |
| `tags`<br/>`pulumi.Input<{ [key: string]: pulumi.Input<string> }>` | Extra tags merged with `commonTags`.                             |

**Outputs**

| Property                 | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `vpc`<br/>`awsx.ec2.Vpc` | Primary composition output: the wrapped AWSX VPC instance exposing public, private, and isolated subnet properties. |
