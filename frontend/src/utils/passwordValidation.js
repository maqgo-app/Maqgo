export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 12
};

export const getPasswordHint = (useAccents = true) => {
  const base = `De ${PASSWORD_RULES.minLength} a ${PASSWORD_RULES.maxLength} caracteres, con letras y números`;
  return useAccents ? base : base.replace('números', 'numeros');
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
