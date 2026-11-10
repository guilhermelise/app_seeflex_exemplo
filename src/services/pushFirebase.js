import {PermissionsAndroid, Platform} from 'react-native';
import {
  getMessaging,
  getToken,
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, {AndroidImportance, EventType} from '@notifee/react-native';

const CANAL_ANDROID_ID = 'notificacoes';

/** Com o app em segundo plano/fechado, o próprio sistema exibe a notificação (payload `notification`
 * enviado pelo servidor). Os handlers precisam existir mesmo vazios e ser registrados fora do React,
 * senão Firebase e notifee logam aviso a cada evento recebido nesse estado. Este módulo é importado
 * pelo app_seeflex.js, antes do registerComponent. */
setBackgroundMessageHandler(getMessaging(), async () => {});
notifee.onBackgroundEvent(async () => {});

/** Push via Firebase Cloud Messaging.
 *
 * Com o app aberto, o FCM não exibe nada - a mensagem chega em `onMessage` e é
 * exibida aqui via notifee. O servidor manda a rota a abrir em `data.url`. */
class PushFirebase {
  constructor() {
    this.messaging = getMessaging();
  }

  async inicializar() {
    if (Platform.OS === 'android') {
      // Android 13+ exige permissão em runtime para exibir notificações.
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await notifee.createChannel({
        id: CANAL_ANDROID_ID,
        name: 'Notificações',
        importance: AndroidImportance.HIGH,
      });
    } else {
      await requestPermission(this.messaging);
    }
  }

  /** Campos do usuário a gravar no servidor para este aparelho receber push (null se ainda não há token).
   * Zera os campos do OneSignal para o servidor não enviar a mesma notificação pelos dois (1 aparelho por usuário). */
  async obterDadosRegistro() {
    try {
      const fcmToken = await getToken(this.messaging);
      if (!fcmToken) {
        return null;
      }
      return this._montarDadosRegistro(fcmToken);
    } catch (error) {
      console.log('Erro ao obter token FCM', error);
      return null;
    }
  }

  /** Campos do usuário a gravar no servidor no logout, para este aparelho parar de receber push. */
  dadosRemocaoRegistro() {
    return {fcm_token: null};
  }

  /** Url da notificação que abriu o app a partir do estado fechado (null se o app abriu normalmente). */
  async obterUrlNotificacaoInicial() {
    const mensagem = await getInitialNotification(this.messaging);
    return this._extrairUrl(mensagem?.data);
  }

  /** Registra os listeners de push. Retorna uma função que remove todos eles.
   * - aoAbrirNotificacao(url): usuário tocou numa notificação com o app em segundo plano ou aberto.
   * - aoAtualizarRegistro(dadosRegistro): o FCM gerou um token novo para o aparelho. */
  registrarListeners(aoAbrirNotificacao, aoAtualizarRegistro) {
    const cancelarAberturaSegundoPlano = onNotificationOpenedApp(this.messaging, mensagem => {
      const url = this._extrairUrl(mensagem?.data);
      if (url) {
        aoAbrirNotificacao(url);
      }
    });

    const cancelarMensagemPrimeiroPlano = onMessage(this.messaging, mensagem => {
      this._exibirNotificacaoPrimeiroPlano(mensagem);
    });

    const cancelarCliqueNotificacaoLocal = notifee.onForegroundEvent(({type, detail}) => {
      if (type === EventType.PRESS) {
        const url = this._extrairUrl(detail.notification?.data);
        if (url) {
          aoAbrirNotificacao(url);
        }
      }
    });

    const cancelarAtualizacaoToken = onTokenRefresh(this.messaging, fcmToken => {
      aoAtualizarRegistro(this._montarDadosRegistro(fcmToken));
    });

    return () => {
      cancelarAberturaSegundoPlano();
      cancelarMensagemPrimeiroPlano();
      cancelarCliqueNotificacaoLocal();
      cancelarAtualizacaoToken();
    };
  }

  _montarDadosRegistro(fcmToken) {
    return {
      fcm_token: fcmToken,
      onesignal_player_id: null,
      onesignal_app_id: null,
    };
  }

  async _exibirNotificacaoPrimeiroPlano(mensagem) {
    try {
      await notifee.displayNotification({
        title: mensagem.notification?.title,
        body: mensagem.notification?.body,
        data: mensagem.data || {},
        android: {
          channelId: CANAL_ANDROID_ID,
          pressAction: {id: 'default'},
        },
      });
    } catch (error) {
      console.log('Erro ao exibir notificação', error);
    }
  }

  _extrairUrl(dados) {
    if (dados && typeof dados.url === 'string' && dados.url !== '') {
      return dados.url;
    }
    return null;
  }
}

export default new PushFirebase();
