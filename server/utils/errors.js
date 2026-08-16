export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Не знайдено') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Потрібна авторизація') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Доступ заборонено') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Конфлікт даних') {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Помилка валідації') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = 'Потрібна оплата', billing = null) {
    super(message, 402, 'PAYMENT_REQUIRED');
    this.billing = billing;
  }
}
