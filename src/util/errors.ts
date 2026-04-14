export class SchedulerError extends Error {
  constructor(
    public readonly type: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = type;
  }

  toResponse() {
    return {
      __type: this.type,
      Message: this.message,
    };
  }
}

export class ResourceNotFoundException extends SchedulerError {
  constructor(message: string) {
    super("ResourceNotFoundException", message, 404);
  }
}

export class ConflictException extends SchedulerError {
  constructor(message: string) {
    super("ConflictException", message, 409);
  }
}

export class ValidationException extends SchedulerError {
  constructor(message: string) {
    super("ValidationException", message, 400);
  }
}
