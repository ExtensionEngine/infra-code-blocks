export { EcsService } from './components/ecs-service';
export { WebServer } from './components/web-server';
export { WebServerBuilder } from './components/web-server/builder';
export { WebServerLoadBalancer } from './components/web-server/load-balancer';

import { OtelCollectorConfigBuilder } from './otel/config';
import { OtelCollector } from './otel';
export const openTelemetry = { OtelCollector, OtelCollectorConfigBuilder };
