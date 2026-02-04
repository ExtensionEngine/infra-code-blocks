import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';
import { StaticSite } from '../../src/v2/components/static-site';

interface Config {
  staticSiteName: string;
  staticSiteDomain: string;
}

interface AwsClients {
  cf: CloudFrontClient;
  s3: S3Client;
}

export interface ProgramOutput {
  staticSite: StaticSite;
}

export interface StaticSiteTestContext
  extends ConfigContext<Config>,
    AwsContext<AwsClients>,
    PulumiProgramContext<ProgramOutput> {}
