# Step 7-015: 인프라 자동화 및 IaC 구현

## 1. Terraform 구성
### 1.1 VPC 모듈
```hcl
# terraform/modules/vpc/main.tf
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 3.0"

  name = "gm-tool-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["ap-northeast-2a", "ap-northeast-2c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
    Terraform   = "true"
  }
}

# terraform/modules/vpc/variables.tf
variable "environment" {
  description = "Environment name"
  type        = string
}

# terraform/modules/vpc/outputs.tf
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}
```

### 1.2 ECS 모듈
```hcl
# terraform/modules/ecs/main.tf
resource "aws_ecs_cluster" "main" {
  name = "gm-tool-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "gm-tool-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory

  container_definitions = jsonencode([
    {
      name  = "gm-tool"
      image = "${var.ecr_repository_url}:${var.image_tag}"
      
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/gm-tool-${var.environment}"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
  }
}

resource "aws_ecs_service" "app" {
  name            = "gm-tool-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups = [aws_security_group.ecs_tasks.id]
    subnets         = var.private_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "gm-tool"
    container_port   = 3000
  }

  deployment_controller {
    type = "ECS"
  }

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
  }
}
```

### 1.3 RDS 모듈
```hcl
# terraform/modules/rds/main.tf
resource "aws_db_instance" "main" {
  identifier = "gm-tool-${var.environment}"
  engine     = "postgres"
  engine_version = "14.7"
  
  instance_class    = var.instance_class
  allocated_storage = var.allocated_storage
  storage_type      = "gp3"

  db_name  = "gmtool"
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  multi_az               = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "gm-tool-${var.environment}"
  subnet_ids = var.private_subnet_ids

  tags = {
    Environment = var.environment
    Project     = "gm-tool"
  }
}
```

## 2. 인프라 자동화 스크립트
### 2.1 인프라 프로비저닝 스크립트
```typescript
// scripts/infrastructure/provision.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/collector';

const execAsync = promisify(exec);

interface ProvisionConfig {
  environment: string;
  region: string;
  variables: Record<string, string>;
}

export async function provisionInfrastructure(config: ProvisionConfig) {
  try {
    // Terraform 초기화
    await execAsync('terraform init', { cwd: './terraform' });

    // Terraform 워크스페이스 설정
    await execAsync(`terraform workspace select ${config.environment} || terraform workspace new ${config.environment}`, {
      cwd: './terraform',
    });

    // Terraform 계획 생성
    const planOutput = await execAsync(
      `terraform plan -var-file=${config.environment}.tfvars -out=tfplan`,
      { cwd: './terraform' }
    );

    await logEvent('info', 'Terraform plan created', {
      environment: config.environment,
      planOutput: planOutput.stdout,
    });

    // Terraform 적용
    const applyOutput = await execAsync('terraform apply tfplan', {
      cwd: './terraform',
    });

    await logEvent('info', 'Infrastructure provisioned', {
      environment: config.environment,
      applyOutput: applyOutput.stdout,
    });
  } catch (error) {
    await logEvent('error', 'Infrastructure provisioning failed', { error });
    throw error;
  }
}
```

### 2.2 인프라 상태 확인 스크립트
```typescript
// scripts/infrastructure/status.ts
import { CloudFormation } from '@aws-sdk/client-cloudformation';
import { logEvent } from '@/lib/logging/collector';

const cloudformation = new CloudFormation({ region: process.env.AWS_REGION });

interface StackStatus {
  stackName: string;
  status: string;
  resources: Array<{
    logicalId: string;
    physicalId: string;
    type: string;
    status: string;
  }>;
  outputs: Array<{
    key: string;
    value: string;
  }>;
}

export async function checkInfrastructureStatus(
  environment: string
): Promise<StackStatus[]> {
  try {
    const stacks = await cloudformation.listStacks({
      StackStatusFilter: [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE',
      ],
    });

    const stackStatuses = await Promise.all(
      stacks.StackSummaries!.filter(stack =>
        stack.StackName!.includes(`gm-tool-${environment}`)
      ).map(async stack => {
        const details = await cloudformation.describeStacks({
          StackName: stack.StackName,
        });
        const resources = await cloudformation.listStackResources({
          StackName: stack.StackName,
        });

        return {
          stackName: stack.StackName!,
          status: stack.StackStatus!,
          resources: resources.StackResourceSummaries!.map(resource => ({
            logicalId: resource.LogicalResourceId!,
            physicalId: resource.PhysicalResourceId!,
            type: resource.ResourceType!,
            status: resource.ResourceStatus!,
          })),
          outputs: details.Stacks![0].Outputs!.map(output => ({
            key: output.OutputKey!,
            value: output.OutputValue!,
          })),
        };
      })
    );

    await logEvent('info', 'Infrastructure status checked', {
      environment,
      stacks: stackStatuses,
    });

    return stackStatuses;
  } catch (error) {
    await logEvent('error', 'Failed to check infrastructure status', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-016.md: 보안 및 규정 준수 자동화 