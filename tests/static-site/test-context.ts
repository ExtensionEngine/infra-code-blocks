import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import { next as studion } from '@studion/infra-code-blocks';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface Config {
  staticSiteName: string;
  staticSiteDomain: string;
}

interface AwsClients {
  cf: CloudFrontClient;
  s3: S3Client;
}

export interface ProgramOutput {
  staticSite: studion.StaticSite;
}

export interface StaticSiteTestContext
  extends ConfigContext<Config>,
    AwsContext<AwsClients>,
    PulumiProgramContext<ProgramOutput> {}
