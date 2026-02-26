import * as pulumi from '@pulumi/pulumi';

export type TaskSize =
  | {
      cpu: pulumi.Input<number>;
      memory: pulumi.Input<number>;
    }
  | keyof typeof PredefinedSize;

export function parseTaskSize(size: pulumi.UnwrappedObject<TaskSize>): {
  cpu: string;
  memory: string;
} {
  if (typeof size === 'string') {
    const { cpu, memory } = PredefinedSize[size];

    return { cpu: `${cpu}`, memory: `${memory}` };
  }

  return {
    cpu: `${size.cpu}`,
    memory: `${size.memory}`,
  };
}

const CPU_1_VCPU = 1024;
const MEMORY_1GB = 1024;

const PredefinedSize = {
  small: {
    cpu: CPU_1_VCPU / 4, // 0.25 vCPU
    memory: MEMORY_1GB / 2, // 0.5 GB memory
  },
  medium: {
    cpu: CPU_1_VCPU / 2, // 0.5 vCPU
    memory: MEMORY_1GB, // 1 GB memory
  },
  large: {
    cpu: CPU_1_VCPU, // 1 vCPU
    memory: MEMORY_1GB * 2, // 2 GB memory
  },
  xlarge: {
    cpu: CPU_1_VCPU * 2, // 2 vCPU
    memory: MEMORY_1GB * 4, // 4 GB memory
  },
  '2xlarge': {
    cpu: CPU_1_VCPU * 4, // 4 vCPU
    memory: MEMORY_1GB * 8, // 8 GB memory
  },
  '3xlarge': {
    cpu: CPU_1_VCPU * 8, // 8 vCPU
    memory: MEMORY_1GB * 16, // 16 GB memory
  },
} as const;
