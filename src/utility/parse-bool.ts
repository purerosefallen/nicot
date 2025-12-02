export const parseBool = (value: any): boolean => {
  const trueValues = ['true', '1', 'yes', 'on', true, 1];
  const falseValues = ['false', '0', 'no', 'off', false, 0];
  if (trueValues.indexOf(value) !== -1) return true;
  if (falseValues.indexOf(value) !== -1) return false;
  if (!!value) {
    return true;
  }
  return undefined;
};
