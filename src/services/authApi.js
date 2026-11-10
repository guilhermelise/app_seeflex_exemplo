import axios from 'axios';
import {TIPO_CREDENCIAL} from './credentialStore';

const config = {
  headers: {'Content-Type': 'application/json'},
};

const loginComUsuarioSenha = async (url, username, password) => {
  const response = await axios.post(`${url}/api/login`, {username, password}, config);
  return response.data.token;
};

const efetivarSessaoComTokenAcesso = (url, username, token) => {
  return axios.post(`${url}/login/token_acesso`, {username, token}, config);
};

const efetivarSessaoComQrCode = (url, tokenCriptografado) => {
  return axios.post(`${url}/login/qrcode`, {token: tokenCriptografado}, config);
};

const relogarComCredencial = ({tipo, url, username, credencial}) => {
  switch (tipo) {
    case TIPO_CREDENCIAL.TOKEN_ACESSO:
      return efetivarSessaoComTokenAcesso(url, username, credencial);
    case TIPO_CREDENCIAL.QRCODE:
      return efetivarSessaoComQrCode(url, credencial);
    default:
      return Promise.reject(new Error(`Tipo de credencial desconhecido: ${tipo}`));
  }
};

export default {
  loginComUsuarioSenha,
  efetivarSessaoComTokenAcesso,
  efetivarSessaoComQrCode,
  relogarComCredencial,
};
