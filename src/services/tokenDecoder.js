const base64UrlToBase64 = (base64Url) => {
  // Substitui os caracteres do formato URL-safe pelo formato padrão
  return base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64Url.length + (4 - (base64Url.length % 4)) % 4, '=');
};

const xorCrypt = (data, key) => {
  const keyLength = key.length;
  let result = '';
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % keyLength);
    result += String.fromCharCode(charCode);
  }
  return result;
};

export const decodificarTokenAcesso = (token) => {
  try {
    const chaveSecreta = '18df4weh3998wdcy';
    const base64Token = base64UrlToBase64(token);
    const decodedData = atob(base64Token);
    const decodedString = xorCrypt(decodedData, chaveSecreta);
    return JSON.parse(decodedString);
  } catch (err) {
    return null;
  }
};
