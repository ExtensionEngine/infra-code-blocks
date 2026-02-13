import * as aws from '@pulumi/aws-v7';
import * as pulumi from '@pulumi/pulumi';
import * as studion from '@studion/infra-code-blocks';
import * as config from './config';

const hostedZoneId = process.env.ICB_HOSTED_ZONE_ID;

const parent = new pulumi.ComponentResource(
  'studion:ss:TestGroup',
  `${config.appName}-root`,
);
const hostedZone = aws.route53.getZoneOutput({
  zoneId: hostedZoneId,
});

const staticSite = new studion.StaticSite(
  config.staticSiteName,
  {
    domain: config.staticSiteDomain,
    hostedZoneId: hostedZone.id,
    tags: {
      Application: config.appName,
      Prefix: config.staticSiteName,
    },
  },
  { parent },
);

new aws.s3.BucketObject(
  `${config.staticSiteName}-index-file`,
  {
    key: 'index.html',
    bucket: staticSite.s3Assets.bucket.id,
    contentType: 'text/html',
    source: new pulumi.asset.StringAsset(
      `
      <!DOCTYPE html>
      <html>
        <head>
            <title>Website | Welcome</title>
        </head>
        <body>
            <h1>Hello from ICB StaticSite component!</h1>
        </body>
      </html>
      `.trim(),
    ),
  },
  { parent: staticSite.s3Assets.bucket },
);

export { staticSite };
