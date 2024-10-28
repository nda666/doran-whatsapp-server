export const checkIdGroupFormat = (remoteJid: string) => {
  const checkIdGroupFormat = /^[0-9]+@g\.us$/;
  return checkIdGroupFormat.test(remoteJid);
};
