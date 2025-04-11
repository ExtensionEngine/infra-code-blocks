export { EcsService } from './components/ecs-service';
export { WebServer } from './components/web-server';
export { WebServerLoadBalancer } from './components/web-server/load-balancer';

import { OtelCollectorConfigBuilder } from './otel/config';
import { OtelCollector } from './otel/container';
export const openTelemetry = { OtelCollector, OtelCollectorConfigBuilder };
