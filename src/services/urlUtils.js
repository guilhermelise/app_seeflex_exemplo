export const forceHttps = (url) => {
  if (!url) return url;

  // Se for endereço de rede local (192.168...), não altera
  if (url.includes('192.168.')) {
    return url;
  }

  // Caso contrário, força https
  return url.replace(/^http:\/\//i, 'https://');
};

export const validarUrlDigitada = (urlDigitada) => {
  const urlDevelopment = urlDigitada.toLowerCase().includes('192.168.');
  if (urlDevelopment) {
    return {valida: true};
  }

  if (!(urlDigitada.includes('.seeflex.com.br') || urlDigitada.includes('.goflex.net.br'))) {
    return {valida: false, mensagem: 'URL Inválida! Favor corrigir!'};
  }
  if (urlDigitada.includes('http://') || !urlDigitada.includes('https://')) {
    return {valida: false, mensagem: "A URL deve iniciar com 'https://'"};
  }
  if ((urlDigitada.toLowerCase().split('https://').length - 1) > 1) {
    return {valida: false, mensagem: 'O prefixo https:// foi informado mais de uma vez na URL'};
  }

  return {valida: true};
};
