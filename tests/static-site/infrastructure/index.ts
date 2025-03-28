import { StaticSite } from '@studion/infra-code-blocks';
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export const site: StaticSite = new StaticSite('test-site', {});
