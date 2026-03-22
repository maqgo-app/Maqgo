export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 16
};

export const getPasswordHint = (useAccents = true) => {
  const base = `Entre ${PASSWORD_RULES.minLength} y ${PASSWORD_RULES.maxLength} caracteres, con letras y numeros`;
  return useAccents ? base.replace('numeros', 'números') : base;
};

export const validatePassword = (password = '', customHint) => {
  const hint = customHint || getPasswordHint();
  if (
    password.length < PASSWORD_RULES.minLength ||
    password.length > PASSWORD_RULES.maxLength
  ) {
    return hint;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return hint;
  }
  return '';
};
