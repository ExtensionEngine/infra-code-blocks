import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { XRayClient } from '@aws-sdk/client-xray';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface OtelTestConfig {
  region: string;
  usersPath: string;
  errorPath: string;
  appName: string;
  prometheusNamespace: string;
}

interface AwsClients {
  cloudwatchLogs: CloudWatchLogsClient;
  xray: XRayClient;
}

export interface ProgramOutput {
  webServer: studion.WebServer;
  appName: string;
  prometheusWorkspace: aws.amp.Workspace;
  cloudWatchLogGroup: aws.cloudwatch.LogGroup;
  cloudWatchLogStreamName: string;
}

export interface OtelTestContext
  extends ConfigContext<OtelTestConfig>,
    PulumiProgramContext<ProgramOutput>,
    AwsContext<AwsClients> {}
