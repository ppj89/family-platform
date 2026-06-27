export interface LoginFormState {
  email: string
  password: string
}

export interface RegisterFormState {
  email: string
  nickname: string
  password: string
  passwordConfirm: string
}

export interface FindEmailFormState {
  nickname: string
}

export interface ResetRequestFormState {
  email: string
}

export interface ResetPasswordFormState {
  password: string
  passwordConfirm: string
}

export interface InquiryFormState {
  email: string
  nickname: string
  contact: string
  message: string
}

export function createLoginFormState(email = ''): LoginFormState {
  return {
    email,
    password: '',
  }
}

export function createRegisterFormState(): RegisterFormState {
  return {
    email: '',
    nickname: '',
    password: '',
    passwordConfirm: '',
  }
}

export function createFindEmailFormState(): FindEmailFormState {
  return {
    nickname: '',
  }
}

export function createResetRequestFormState(): ResetRequestFormState {
  return {
    email: '',
  }
}

export function createResetPasswordFormState(): ResetPasswordFormState {
  return {
    password: '',
    passwordConfirm: '',
  }
}

export function createInquiryFormState(): InquiryFormState {
  return {
    email: '',
    nickname: '',
    contact: '',
    message: '',
  }
}
