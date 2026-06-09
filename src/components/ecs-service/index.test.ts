import { before, beforeEach, describe, it } from 'node:test';
import * as assert from 'node:assert';
import type * as aws from '@pulumi/aws';
import type * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';

const TASK_DEFINITION_TYPE = 'aws:ecs/taskDefinition:TaskDefinition';
const DEFAULT_REGION = 'us-west-2';

type EcsServiceClass = typeof import('./index').EcsService;
let EcsService: EcsServiceClass;

describe('EcsService', () => {
  before(async () => {
    await pulumi.runtime.setMocks(
      {
        call: args => {
          if (args.token === 'aws:index/getRegion:getRegion') {
            return { id: 'us-east-1', name: 'us-east-1' };
          }

          return args.inputs;
        },
        newResource: args => {
          captureResource(args.type, args.name, args.inputs);

          const id = `${args.name}-id`;
          const name = args.inputs.name ?? args.name;

          return {
            id: args.custom ? id : undefined,
            state: {
              ...args.inputs,
              arn: `arn:aws:mock:${args.type}:${args.name}`,
              arnWithoutRevision: `arn:aws:mock:${args.type}:${args.name}`,
              id,
              name,
            },
          };
        },
      },
      'icb-test-ecs-service',
      'dev',
      false,
    );

    ({ EcsService } = await import('./index'));
  });

  beforeEach(() => {
    capturedResources.clear();
  });

  describe('task definition serialization', () => {
    describe('nested Pulumi output values', () => {
      let serializedContainerDefinitions: unknown;

      beforeEach(async () => {
        await pulumi.runtime.runInPulumiStack(async () => {
          const service = createEcsService('serialization', {
            containers: [
              createDefaultContainer({
                name: pulumi.output('app'),
                image: pulumi.output('example/image:latest'),
                command: pulumi.output(['sh', '-c', 'echo ok']),
                environment: pulumi.output([
                  { name: 'FROM_OUTPUT', value: 'resolved' },
                ]),
                portMappings: pulumi.output([
                  EcsService.createTcpPortMapping(pulumi.output(8080)),
                ]),
                mountPoints: [
                  {
                    sourceVolume: pulumi.output('data-volume'),
                    containerPath: pulumi.output('/data'),
                    readOnly: pulumi.output(true),
                  },
                ],
              }),
            ],
          });

          await resolveInput(service.taskDefinition.arn);
        });

        const { containerDefinitions } =
          getCapturedResourceInput<TaskDefinitionInputs>(TASK_DEFINITION_TYPE);

        serializedContainerDefinitions = containerDefinitions
          ? await resolveInput(containerDefinitions)
          : undefined;
      });

      it('should pass valid serialized container definitions to the task definition', () => {
        assert.ok(
          typeof serializedContainerDefinitions === 'string',
          'Container definitions should resolve to a JSON string',
        );

        assert.doesNotMatch(
          serializedContainerDefinitions,
          /__pulumi|OutputImpl|Calling \[toJSON\]/,
          'Serialized container definitions should not contain Pulumi output internals',
        );
      });

      it('should serialize an array of containers', () => {
        const containerDefinitions = JSON.parse(
          serializedContainerDefinitions as string,
        );

        assert.ok(
          Array.isArray(containerDefinitions),
          'Serialized container definitions should parse to an array',
        );
        assert.strictEqual(
          containerDefinitions.length,
          1,
          'Should serialize one container definition',
        );
        assert.ok(
          containerDefinitions[0],
          'Serialized container definition should not be falsy.',
        );
      });

      it('should serialize basic container fields', () => {
        const [container] = JSON.parse(
          serializedContainerDefinitions as string,
        );

        assert.strictEqual(container.name, 'app');
        assert.strictEqual(container.image, 'example/image:latest');
      });

      it('should serialize command and environment fields', () => {
        const [container] = JSON.parse(
          serializedContainerDefinitions as string,
        );

        assert.deepStrictEqual(container.command, ['sh', '-c', 'echo ok']);
        assert.deepStrictEqual(container.environment, [
          { name: 'FROM_OUTPUT', value: 'resolved' },
        ]);
      });

      it('should serialize port mappings and mount points', () => {
        const [container] = JSON.parse(
          serializedContainerDefinitions as string,
        );

        assert.deepStrictEqual(container.portMappings, [
          { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
        ]);
        assert.deepStrictEqual(container.mountPoints, [
          {
            sourceVolume: 'data-volume',
            containerPath: '/data',
            readOnly: true,
          },
        ]);
      });

      it('should preserve generated container defaults', () => {
        const [container] = JSON.parse(
          serializedContainerDefinitions as string,
        );

        assert.strictEqual(container.readonlyRootFilesystem, false);
        assert.deepStrictEqual(container.logConfiguration, {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': 'serialization-log-group',
            'awslogs-region': DEFAULT_REGION,
            'awslogs-stream-prefix': 'ecs',
          },
        });
      });
    });

    it('should register the task definition when container definitions contain unknown preview values', async () => {
      await pulumi.runtime.runInPulumiStack(async () => {
        createEcsService('preview-serialization', {
          containers: [
            createDefaultContainer({
              image: pulumi.output(pulumi.unknown) as pulumi.Output<string>,
              command: pulumi.output(['sh', '-c', 'echo ok']),
            }),
          ],
        });

        await waitForCapturedResource(TASK_DEFINITION_TYPE);
      });

      const taskDefinitionInputs =
        getCapturedResourceInput<TaskDefinitionInputs>(TASK_DEFINITION_TYPE);

      assert.ok(
        'containerDefinitions' in taskDefinitionInputs,
        'Task definition should receive a containerDefinitions input',
      );
      assert.strictEqual(
        taskDefinitionInputs.containerDefinitions,
        undefined,
        'Unresolved container definitions should remain an unknown provider input instead of blocking resource registration',
      );
    });
  });
});

type EcsServiceInstance = InstanceType<EcsServiceClass>;
type EcsServiceArgs = ConstructorParameters<EcsServiceClass>[1];
type EcsServiceContainer = EcsServiceArgs['containers'][number];
type ResourceInputs = Record<string, unknown>;
type CapturedResource = {
  name: string;
  inputs: ResourceInputs;
};
type TaskDefinitionInputs = ResourceInputs & {
  containerDefinitions?: pulumi.Input<string>;
};

const capturedResources = new Map<string, CapturedResource[]>();

function createEcsService(
  name: string,
  args: Partial<EcsServiceArgs> = {},
): EcsServiceInstance {
  const cluster = {
    id: pulumi.output('cluster-arn'),
    name: pulumi.output('cluster-name'),
  } as unknown as aws.ecs.Cluster;
  const vpc = {
    vpcId: pulumi.output('vpc-123456'),
    privateSubnetIds: pulumi.output(['subnet-private-1']),
    publicSubnetIds: pulumi.output(['subnet-public-1']),
    vpc: pulumi.output({ cidrBlock: '10.0.0.0/16' }),
  } as unknown as awsx.ec2.Vpc;

  return new EcsService(name, {
    cluster,
    vpc,
    region: DEFAULT_REGION,
    containers: [createDefaultContainer()],
    ...args,
  });
}

function createDefaultContainer(
  overrides: Partial<EcsServiceContainer> = {},
): EcsServiceContainer {
  return {
    name: 'app',
    image: 'example/image:latest',
    ...overrides,
  };
}

// TODO: Pulumi mocks; move into separate file to allow reuse across unit test files

function captureResource(
  type: string,
  name: string,
  inputs: ResourceInputs,
): void {
  const resourcesForType = capturedResources.get(type) ?? [];

  resourcesForType.push({ name, inputs });
  capturedResources.set(type, resourcesForType);
}

function getCapturedResources(type: string): CapturedResource[] {
  return capturedResources.get(type) ?? [];
}

function getCapturedResourceInput<T extends ResourceInputs>(type: string): T {
  const inputs = getCapturedResources(type).map(resource => resource.inputs);

  assert.strictEqual(
    inputs.length,
    1,
    `Expected exactly one registered resource for ${type}`,
  );

  return inputs[0] as T;
}

async function waitForCapturedResource(
  type: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const { timeoutMs = 1000, intervalMs = 10 } = options;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (getCapturedResources(type).length > 0) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  assert.fail(
    `Timed out after ${timeoutMs}ms waiting for resource registration: ${type}`,
  );
}

async function resolveInput<T>(value: pulumi.Input<T>): Promise<T> {
  if (pulumi.Output.isInstance(value)) {
    return new Promise<T>(resolve => {
      value.apply(resolved => {
        resolve(resolved);

        return resolved;
      });
    });
  }

  return value;
}
