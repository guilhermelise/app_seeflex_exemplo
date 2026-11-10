import * as Keychain from 'react-native-keychain';

const SERVICE = 'br.com.seeflex.sessao';

export const TIPO_CREDENCIAL = {
  TOKEN_ACESSO: 'TOKEN_ACESSO',
  QRCODE: 'QRCODE',
};

const existeCredencialSalva = () => {
  return Keychain.hasGenericPassword({service: SERVICE});
};

/** Sem biometria cadastrada, BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE ainda funcionaria via
 * PIN/padrão/senha de tela do aparelho - mas isso exigiria digitar a senha de tela a cada
 * leitura, o que quebra o relogin automático silencioso. Por isso só usa accessControl
 * biométrico quando existe biometria de verdade; caso contrário, guarda sem nenhum controle
 * de acesso extra (a proteção continua sendo o WHEN_UNLOCKED_THIS_DEVICE_ONLY + descriptografia
 * do Keystore, sem prompt). */
const existeBiometriaDisponivel = async () => {
  const tipo = await Keychain.getSupportedBiometryType();
  return tipo != null;
};

const salvarCredencial = async ({tipo, url, username, credencial}) => {
  const payload = JSON.stringify({tipo, url, username, credencial});

  try {
    if (await existeBiometriaDisponivel()) {
      const resultado = await Keychain.setGenericPassword(username || 'seeflex', payload, {
        service: SERVICE,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });

      if (resultado) {
        return resultado;
      }
    }

    return await Keychain.setGenericPassword(username || 'seeflex', payload, {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    /** Cancelamento do prompt biométrico, erro de criptografia, etc. O login já foi
     * efetivado nesse ponto - só o relogin automático fica indisponível até a próxima vez. */
    return null;
  }
};

const lerCredencial = async ({promptTitle, promptCancel}) => {
  let resultado;
  try {
    if (await existeBiometriaDisponivel()) {
      resultado = await Keychain.getGenericPassword({
        service: SERVICE,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
        authenticationPrompt: {
          title: promptTitle,
          cancel: promptCancel,
        },
      });
    } else {
      // Sem biometria: lê direto, sem nenhum prompt, pra permitir relogin automático silencioso.
      resultado = await Keychain.getGenericPassword({service: SERVICE});
    }
  } catch (error) {
    /** Cancelamento, biometria indisponível, lockout, etc. Nenhum desses casos deve
     * apagar a credencial salva - só um 401 do servidor faz isso (ver authApi). */
    return null;
  }

  if (!resultado) {
    return null;
  }

  try {
    return JSON.parse(resultado.password);
  } catch (error) {
    return null;
  }
};

const limparCredencial = () => {
  return Keychain.resetGenericPassword({service: SERVICE});
};

export default {
  existeCredencialSalva,
  salvarCredencial,
  lerCredencial,
  limparCredencial,
};
