import * as aws from '@pulumi/aws';
import * as studion from '@studion/infra-code-blocks';
import { IAMClient } from '@aws-sdk/client-iam';
import { AwsContext, ConfigContext, PulumiProgramContext } from '../types';

interface Config {
  region: string;
  usersPath: string;
  appName: string;
  prometheusNamespace: string;
  grafanaUrl: string;
  grafanaAuth: string;
}

interface AwsClients {
  iam: IAMClient;
}

export interface ProgramOutput {
  webServer: studion.WebServer;
  prometheusWorkspace: aws.amp.Workspace;
  grafanaSloComponent: studion.grafana.Grafana;
}

export interface GrafanaTestContext
  extends ConfigContext<Config>,
    PulumiProgramContext<ProgramOutput>,
    AwsContext<AwsClients> {}
