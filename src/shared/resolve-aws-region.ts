import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

type RegionAwareArgs = {
  region?: pulumi.Input<string>;
};

export function resolveAwsRegion(
  { region }: RegionAwareArgs,
  parent: pulumi.Resource,
): pulumi.Output<string> {
  return region
    ? pulumi.output(region)
    : aws.getRegionOutput({}, { parent }).region.apply(resolvedRegion => {
        if (!resolvedRegion) {
          throw new Error(
            'AWS region could not be resolved from the active AWS provider. Configure the AWS provider region or pass region explicitly.',
          );
        }

        return resolvedRegion;
      });
}
