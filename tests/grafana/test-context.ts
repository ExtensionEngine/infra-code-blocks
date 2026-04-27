import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';
import { IAMClient } from '@aws-sdk/client-iam';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface Config {
  region: string;
  usersPath: string;
  appName: string;
  ampNamespace: string;
  grafanaUrl: string;
  grafanaAwsAccountId: string;
}

interface AwsClients {
  iam: IAMClient;
}

export interface ProgramOutput {
  webServer: studion.WebServer;
  ampWorkspace: aws.amp.Workspace;
  cloudWatchLogGroup: aws.cloudwatch.LogGroup;
  ampGrafana: studion.grafana.Grafana;
  configurableGrafana: studion.grafana.Grafana;
  logsAndTracesGrafana: studion.grafana.Grafana;
}

export interface GrafanaTestContext
  extends
    ConfigContext<Config>,
    PulumiProgramContext<ProgramOutput>,
    AwsContext<AwsClients> {}
