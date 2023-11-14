import * as pulumi from '@pulumi/pulumi';

const CPU_1_VCPU = 1024;
const MEMORY_1GB = 1024;

export const PredefinedSize = {
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
} as const;

export const commonTags = {
  Env: pulumi.getStack(),
  Project: pulumi.getProject(),
};
