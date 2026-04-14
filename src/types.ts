/** Mirrors the AWS SDK ScheduleTarget shape */
export interface Target {
  Arn: string;
  RoleArn?: string;
  Input?: string;
  RetryPolicy?: {
    MaximumRetryAttempts?: number;
    MaximumEventAgeInSeconds?: number;
  };
  DeadLetterConfig?: {
    Arn?: string;
  };
  SqsParameters?: {
    MessageGroupId?: string;
  };
  // Additional target parameters can be extended here
}

export interface FlexibleTimeWindow {
  Mode: "OFF" | "FLEXIBLE";
  MaximumWindowInMinutes?: number;
}

export interface Schedule {
  Name: string;
  GroupName: string;
  Arn: string;
  ScheduleExpression: string;
  ScheduleExpressionTimezone: string;
  State: "ENABLED" | "DISABLED";
  Description?: string;
  Target: Target;
  FlexibleTimeWindow: FlexibleTimeWindow;
  StartDate?: string;
  EndDate?: string;
  KmsKeyArn?: string;
  CreationDate: string;
  LastModificationDate: string;
  ActionAfterCompletion?: "NONE" | "DELETE";
}

export interface ScheduleGroup {
  Name: string;
  Arn: string;
  State: "ACTIVE" | "DELETING";
  CreationDate: string;
  LastModificationDate: string;
}

export interface ScheduleRow {
  name: string;
  group_name: string;
  arn: string;
  schedule_expression: string;
  schedule_expression_timezone: string;
  state: string;
  description: string | null;
  target_json: string;
  flexible_time_window_json: string;
  start_date: string | null;
  end_date: string | null;
  kms_key_arn: string | null;
  action_after_completion: string | null;
  last_run: string | null;
  creation_date: string;
  last_modification_date: string;
}

export interface ScheduleGroupRow {
  name: string;
  arn: string;
  state: string;
  creation_date: string;
  last_modification_date: string;
}

export interface HistoryRow {
  id: number;
  schedule_name: string;
  group_name: string;
  fired_at: string;
  target_arn: string;
  status: string;
  error_message: string | null;
}

export interface DispatchContext {
  scheduleName: string;
  groupName: string;
  firedAt: string;
}
