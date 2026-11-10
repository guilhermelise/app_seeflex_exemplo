import React, {useState, useEffect, useRef} from 'react';
import {
  StyleSheet,
  View,
  Image,
  Platform,
  ActivityIndicator,
  BackHandler,
  Alert,
  Button,
  StatusBar,
  Linking,
  Text,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {WebView} from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import axios from 'axios';
import moment from 'moment';
import permissoes from './permissoes';
import {SafeAreaView} from 'react-native-safe-area-context';
import LoginNativoScreen from './LoginNativoScreen';
import credentialStore from '../services/credentialStore';
import authApi from '../services/authApi';
import {forceHttps} from '../services/urlUtils';
import servicoPush from '../services/pushFirebase';

const SCRIPT_DETECTAR_LOGOUT = `
  (function() {
    if (window.__seeflexLogoutListenerInstalado) { return; }
    window.__seeflexLogoutListenerInstalado = true;
    document.addEventListener('click', function(event) {
      var alvo = event.target.closest('a[href*="/logout"]');
      if (alvo && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('SEEFLEX_LOGOUT_CLICK');
      }
    }, true);
  })();
  true;
`;

/** A página de login admin (/admins/login) tem um link "Acesso Usuário" pra quem entrou ali
 * por engano voltar pro login normal. Esse link é uma <a href="/users/login"> comum, mas o
 * site roda Turbolinks (ver app/javascript/packs/vue-turbolinks.js do rastreador): o clique é
 * interceptado e vira um fetch + history.pushState, nunca uma navegação de página inteira -
 * por isso onShouldStartLoadWithRequest (que só vê requests de navegação de verdade) nunca
 * dispara pra esse caso, exatamente como já acontecia com o link de logout acima. A solução é
 * a mesma: um listener de clique em fase de captura (roda antes do Turbolinks interceptar)
 * avisando a app nativa via postMessage.
 */
const SCRIPT_DETECTAR_VOLTAR_LOGIN_USUARIO = `
  (function() {
    if (window.__seeflexVoltarLoginUsuarioListenerInstalado) { return; }
    window.__seeflexVoltarLoginUsuarioListenerInstalado = true;
    document.addEventListener('click', function(event) {
      var alvo = event.target.closest('a[href*="/users/login"]');
      if (alvo && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('SEEFLEX_VOLTAR_LOGIN_USUARIO_CLICK');
      }
    }, true);
  })();
  true;
`;

const AppSeeflex = (props) => {
  const webview = useRef(null);
  const [url, setUrl] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [pushAtivada, setPushAtivada] = useState(false);
  const [user_id, setUser_id] = useState(null);
  const [btnVoltarIOSAtivo, setbtnVoltarIOSAtivo] = useState(false);
  const [paginaVoltarIOS, setPaginaVoltarIOS] = useState('');
  const [mostrarLoginNativo, setMostrarLoginNativo] = useState(false);
  const [tentandoRelogAutomatico, setTentandoRelogAutomatico] = useState(false);
  const [webviewKey, setWebviewKey] = useState(0);
  const appState = useRef(AppState.currentState);
  const logoutIntencionalRef = useRef(false);
  const ultimaUrlBloqueadaRef = useRef(null);
  const ultimaRotaAtivaRef = useRef(null);
  const tentativasRelogRef = useRef(0);
  const backHandlerSubscriptionRef = useRef(null);
  const cancelarListenersPushRef = useRef(null);
  const modoAdminRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      //Ao deixar o app inativo por mais de 60s, ao reabrir, forçar o recarregamento da tela para reconectar.
      appState.current = nextAppState;
      if (['inactive', 'background'].includes(appState.current)) {
        salvarHoraAppBackground();
      }
      if (appState.current === 'active') {
        reloadMapaIfNeeded();
      }
    });

    componentDidMount();

    return () => {
      componentWillUnmount();
      subscription.remove();
    };
  }, []);

  const salvarHoraAppBackground = async () => {
    let rotaAtual = await AsyncStorage.getItem('@SeeFlex:rotaAtual');
    if (['/mapa', '/'].includes(rotaAtual)) {
      AsyncStorage.setItem(
        '@SeeFlex:dataHoraAppBackground',
        moment().format('YYYY/MM/DD HH:mm:ss'),
      );
    }
  };

  const reloadMapaIfNeeded = async () => {
    let dataHoraAppInBackground = await AsyncStorage.getItem('@SeeFlex:dataHoraAppBackground');
    if (dataHoraAppInBackground) {
      AsyncStorage.removeItem('@SeeFlex:dataHoraAppBackground');
      let dataHoraAtual = moment(moment().format('YYYY/MM/DD HH:mm:ss'), 'YYYY/MM/DD HH:mm:ss');
      let dataAppInactive = moment(dataHoraAppInBackground, 'YYYY/MM/DD HH:mm:ss')
      let diff = dataHoraAtual.diff(dataAppInactive, 'seconds');
      if (diff > 60) {
        setRootUrlToInitApp();
      }
    }
  };

  const setRootUrlToInitApp = async () => {
    const urlStorage = await AsyncStorage.getItem('@SeeFlex:url');
    carregarUrlNaWebView(urlStorage);
  };

  const ActivityIndicatorLoadingView = () => {
    return (
      <View style={styles.loading}>
        <Image style={styles.logo} source={require('../images/icon.png')} />
        <ActivityIndicator color="#3A80D2" size="large" />
      </View>
    );
  };

  const componentDidMount = async () => {
    try {
      await permissoes.solicitarPermissoes();

      /** Push via Firebase Cloud Messaging - ver src/services/pushFirebase.js. */
      await servicoPush.inicializar();
      cancelarListenersPushRef.current = servicoPush.registrarListeners(onOpened, onRegistroPushAtualizado);

      /** App aberto a partir do estado fechado por um clique na notificação: só guarda a url -
       * o montarWebView chamado pelo fluxo normal de iniciarSessao já a consome. */
      const urlNotificacaoInicial = await servicoPush.obterUrlNotificacaoInicial();
      if (urlNotificacaoInicial) {
        await AsyncStorage.setItem('@SeeFlex:pushUrl', urlNotificacaoInicial);
      }

      if (Platform.OS === 'android') {
        backHandlerSubscriptionRef.current = BackHandler.addEventListener('hardwareBackPress', backHandler);
      }
    } catch (error) {
      console.error(error);
    }
    iniciarSessao();
  };

  const componentWillUnmount = () => {
    // BackHandler.removeEventListener foi removido no RN 0.65+; a forma atual é chamar
    // .remove() na subscription retornada por addEventListener (igual já é feito com o
    // AppState acima). Deixar a chamada antiga aqui lançava TypeError no cleanup do useEffect
    // sempre que o componente desmontava/remontava (ex: Android recriando a Activity ao reabrir
    // o app), e sem Error Boundary o React descartava a árvore inteira - tela em branco.
    backHandlerSubscriptionRef.current?.remove();
    cancelarListenersPushRef.current?.();
  }

  const onOpened = async (link) => {
    await AsyncStorage.setItem('@SeeFlex:pushUrl', link);

    /** `onOpened` é registrado uma única vez no mount (servicoPush.registrarListeners),
     * então não pode depender do estado `rootUrl` (ficaria preso ao valor inicial) - lê sempre
     * a URL atual direto do AsyncStorage, como o restante do fluxo de sessão já faz. */
    const urlAtual = await AsyncStorage.getItem('@SeeFlex:url');
    if (urlAtual) {
      montarWebView(urlAtual);
    }
  };

  /** O FCM pode trocar o token do aparelho a qualquer momento. Também é registrado uma única vez no mount, então pelo
   * mesmo motivo do `onOpened` lê a URL e o usuário logado direto do AsyncStorage/cookie em vez do estado. */
  const onRegistroPushAtualizado = async (dadosRegistro) => {
    try {
      const urlAtual = await AsyncStorage.getItem('@SeeFlex:url');
      if (!urlAtual) {
        return;
      }
      const cookie = await CookieManager.get(urlAtual, true);
      if (cookie.user?.value) {
        await enviarRegistroPush(urlAtual, cookie.user.value, dadosRegistro);
      }
    } catch (error) {
      console.log(error);
    }
  };

  /** Grava no usuário os campos de push do aparelho, montados pelo serviço de push (ver
   * pushFirebase.js). */
  const enviarRegistroPush = (urlBase, userId, dadosRegistro) => {
    const config = {
      headers: {'Content-Type': 'application/json'},
    };
    const payload = {
      user: dadosRegistro,
    };
    return axios.put(`${urlBase}/api/usuarios/${userId}`, payload, config);
  };

  const ativarBotaoVoltarFisicoAndroid = async (valor) => {
    await AsyncStorage.setItem('@SeeFlex:botao-voltar-ativo', valor.toString());
  };

  const backHandler = async () => {
    let botaoVoltarAtivo = await AsyncStorage.getItem('@SeeFlex:botao-voltar-ativo');
    if (botaoVoltarAtivo === 'true' && webview.current) {
      webview.current.goBack();
      return true;
    } else {
      sairApp();
      return true;
    }
  };

  const sairApp = () => {
    Alert.alert(
      'Sair do Aplicativo',
      'Deseja realmente sair do aplicativo?',
      [
        {text: 'NÃO', onPress: () => null, style: 'cancel'},
        {text: 'SIM', onPress: () => BackHandler.exitApp()},
      ],
      {cancelable: false},
    );
    return true;
  };

  /** Resolve a URL raiz do servidor. Retorna `null` quando não há uma URL conhecida
   * e é necessário perguntar ao usuário (tratado pela LoginNativoScreen). */
  const resolverUrlRaiz = async () => {
    if (props.urlsDisponiveis.length === 0) {
      return await AsyncStorage.getItem('@SeeFlex:url');
    } else if (props.urlsDisponiveis.length === 1) {
      const urlApp = forceHttps(props.urlsDisponiveis[0].url);
      /** Mesmo com uma url, deve salvar no storage, para o app não se perder caso aumente o numero de url */
      await AsyncStorage.setItem('@SeeFlex:url', urlApp);
      return urlApp;
    } else {
      return await AsyncStorage.getItem('@SeeFlex:url');
    }
  };

  /** Ponto único que altera a URL carregada na WebView. Quando `destino` é igual à URL que já
   * está no state (ex: um retry de relogin apontando de volta pra mesma página raiz), só trocar
   * o state não gera nenhum re-render útil (o valor não muda) e `webview.current.reload()`
   * também não resolve - ele recarrega o estado *interno* atual da WebView, que já pode estar
   * corrompido em "about:blank" por causa de uma navegação anterior bloqueada/redirecionada
   * (foi exatamente isso que deixava a tela presa em branco mesmo após um relogin bem-sucedido).
   * A forma confiável de garantir uma carga do zero é forçar o React a desmontar e remontar o
   * componente WebView inteiro, trocando sua `key`. */
  const carregarUrlNaWebView = (destino) => {
    if (destino === url) {
      setWebviewKey(k => k + 1);
    } else {
      setUrl(destino);
    }
  };

  const montarWebView = async (destino) => {
    const pushUrl = await AsyncStorage.getItem('@SeeFlex:pushUrl');
    if (pushUrl) {
      await AsyncStorage.removeItem('@SeeFlex:pushUrl');
      carregarUrlNaWebView(destino + pushUrl);
    } else {
      carregarUrlNaWebView(destino);
    }
  };

  const iniciarSessao = async () => {
    const urlApp = await resolverUrlRaiz();
    if (!urlApp) {
      setMostrarLoginNativo(true);
      return;
    }
    setRootUrl(urlApp);

    const existeCredencial = await credentialStore.existeCredencialSalva();
    if (!existeCredencial) {
      await tentarObterUsuarioDeSessaoAntiga(urlApp);
      setMostrarLoginNativo(true);
      return;
    }

    await tentarRelogAutomatico();
  };

  /** Migração da versão antiga do app: se ainda não há usuário salvo localmente (instalação nova
   * do novo formato de login), tenta descobrir o usuário através do cookie de sessão web que já
   * pode existir de uma sessão antiga (o cookie sobrevive à atualização do app). Best-effort: se
   * o cookie já tiver expirado (dura só 1 dia a partir do último login) ou não existir, não faz
   * nada e o usuário simplesmente digita o usuário manualmente na LoginNativoScreen. */
  const tentarObterUsuarioDeSessaoAntiga = async (urlApp) => {
    try {
      const usuarioJaSalvo = await AsyncStorage.getItem('@SeeFlex:ultimoUsuario');
      if (usuarioJaSalvo) return;

      const cookie = await CookieManager.get(urlApp, true);
      const userId = cookie.user?.value;
      if (!userId) return;

      const response = await axios.get(`${urlApp}/api/usuarios/${userId}`);
      if (response.data?.username) {
        await AsyncStorage.setItem('@SeeFlex:ultimoUsuario', response.data.username);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const tentarRelogAutomatico = async () => {
    setTentandoRelogAutomatico(true);
    try {
      const cred = await credentialStore.lerCredencial({
        promptTitle: 'Confirme sua identidade para continuar conectado',
        promptCancel: 'Usar outra conta',
      });
      if (!cred) {
        setTentandoRelogAutomatico(false);
        setMostrarLoginNativo(true);
        return;
      }
      await efetivarLoginEEntrar({...cred, persistir: false});
      // Não esconde o overlay aqui: só porque o axios aceitou o token não significa que a
      // WebView vai de fato carregar uma página válida (pode ser redirecionada de volta pro
      // /users/login - ver handleWebViewRequest). Quem esconde é onNavigationStateChange, ao
      // confirmar que chegou numa página real, ou a guarda anti-loop, ao desistir. Isso evita
      // o overlay "Reconectando" pisando duas vezes (uma por tentativa) com um flash de WebView
      // em branco entre elas.
    } catch (error) {
      /** Credencial lida com sucesso (biometria ok), mas o servidor recusou. Só um 401
       * de verdade (senha trocada, usuário inativado, etc.) invalida a credencial - erro
       * de rede, por exemplo, não deve apagar o token salvo. */
      if (error.response?.status === 401) {
        try {
          await credentialStore.limparCredencial();
        } catch (clearError) {
          /** Se o Keychain falhar ao limpar (comum em emuladores sem keystore/lock-screen
           * configurado), não pode deixar essa exceção escapar do catch e travar o app na
           * tela de "Reconectando..." pra sempre - o usuário precisa cair na tela de login. */
          console.log(clearError);
        }
      }
      setTentandoRelogAutomatico(false);
      setMostrarLoginNativo(true);
    }
  };

  /** Único ponto que efetiva uma sessão de verdade (POST /login/token_acesso ou /login/qrcode)
   * e monta a WebView. Reaproveitado pelo login por senha, QR Code e token colado
   * (via LoginNativoScreen) e pelo relogin automático via biometria. */
  const efetivarLoginEEntrar = async ({tipo, url: urlLogin, username, credencial, persistir = true}) => {
    await AsyncStorage.setItem('@SeeFlex:url', urlLogin);
    await authApi.relogarComCredencial({tipo, url: urlLogin, username, credencial});
    if (persistir) {
      await credentialStore.salvarCredencial({tipo, url: urlLogin, username, credencial});
    }
    if (username) {
      // Guardado fora do Keychain (não é sensível) só pra pré-preencher o campo de usuário
      // na LoginNativoScreen, caso o usuário precise digitar a senha de novo depois.
      await AsyncStorage.setItem('@SeeFlex:ultimoUsuario', username);
    }

    setRootUrl(urlLogin);
    setMostrarLoginNativo(false);
    /** NÃO esconde o overlay "Reconectando" nem zera tentativasRelogRef aqui: o login por token
     * pode "suceder" no axios e mesmo assim a WebView não conseguir carregar nenhuma página de
     * verdade depois (ex: um redirect do servidor pra uma URL insegura, que a WebView não
     * consegue seguir). Fazer isso aqui escondia o overlay cedo demais (dando a impressão de
     * "piscar" quando a tentativa seguinte reaparecia) e desarmava a guarda anti-loop de
     * handleWebViewRequest. Só onNavigationStateChange esconde/zera, e só ao confirmar que
     * chegou numa página real. */

    const destino = ultimaUrlBloqueadaRef.current;
    ultimaUrlBloqueadaRef.current = null;
    // Só restaura se for de fato uma página do app - nunca "about:blank" ou outro valor
    // transitório que a WebView possa ter reportado (ver onNavigationStateChange).
    if (destino && destino.indexOf(urlLogin) === 0) {
      carregarUrlNaWebView(destino);
    } else {
      await montarWebView(urlLogin);
    }
  };

  const handleLoginNativoSucesso = async (credencial) => {
    try {
      await efetivarLoginEEntrar({...credencial, persistir: true});
    } catch (error) {
      Alert.alert('Atenção!', 'Não foi possível efetuar o login! ' + error);
    }
  };

  /** Login administrador não passa pelo fluxo de token/biometria da LoginNativoScreen: não há
   * chamada a authApi nem credencial persistida em credentialStore. A própria página web de
   * admin (sessão via cookie) cuida da autenticação - aqui só se monta a WebView já apontando
   * pra ela. */
  const handleEntrarComoAdmin = async (urlBase) => {
    const urlAdmin = forceHttps(urlBase);
    await AsyncStorage.setItem('@SeeFlex:url', urlAdmin);
    modoAdminRef.current = true;
    setRootUrl(urlAdmin);
    setMostrarLoginNativo(false);
    carregarUrlNaWebView(`${urlAdmin}/admins/login`);
  };

  /** Link "Esqueci minha senha" da LoginNativoScreen: assim como o acesso admin, não passa pelo
   * fluxo de token/biometria - só monta a WebView já apontando pra página de recuperação de
   * senha, com o usuário (se já digitado) pré-preenchido via query string. A própria página web
   * cuida do envio do e-mail de recuperação. */
  const handleEsqueciMinhaSenha = async (urlBase, username) => {
    const urlServidor = forceHttps(urlBase);
    await AsyncStorage.setItem('@SeeFlex:url', urlServidor);
    setRootUrl(urlServidor);
    setMostrarLoginNativo(false);
    carregarUrlNaWebView(`${urlServidor}/users/secret/new?username=${encodeURIComponent(username || '')}`);
  };

  const ativarPush = () => {
    setTimeout(() => {
      CookieManager.get(rootUrl, true)
        .then(async cookie => {
          if (cookie.user?.value) {
            setUser_id(cookie.user?.value);
            atualizaUrlAppSeNecessario(cookie.user?.value);

            if (!pushAtivada) {
              /** Sem registro (ex.: falha de rede ao falar com o Firebase, permissão ainda não
               * concedida) não marca o push como ativado, assim tenta de novo no próximo
               * carregamento do mapa. */
              const dadosRegistro = await servicoPush.obterDadosRegistro();
              if (dadosRegistro) {
                enviarRegistroPush(rootUrl, cookie.user?.value, dadosRegistro)
                  .then(response => {
                    setPushAtivada(true);
                  })
                  .catch(error => {
                    console.log(error);
                  });
              }
            }
          }
        })
        .catch(error => {
          console.log(error);
        });
    }, 5000);
  };

  const atualizaUrlAppSeNecessario = (userId) => {
    if (userId) {
      axios
        .get(`${rootUrl}/api/usuarios/${userId}`)
        .then(async response => {
          let urlNovaApp = forceHttps(response.data.url_usar_aplicativos);
          if (urlNovaApp && urlNovaApp != url) {
            await AsyncStorage.setItem('@SeeFlex:url', urlNovaApp);
          }
        })
        .catch(error => {
          console.log(error);
        });
    }
  }

  const inativarPush = () => {
    if (pushAtivada && user_id != null) {
      const config = {
        headers: {'Content-Type': 'application/json'},
      };
      const payload = {
        user: servicoPush.dadosRemocaoRegistro(),
      };

      axios
        .put(`${rootUrl}/api/usuarios/${user_id}`, payload, config)
        .then(response => {
          setPushAtivada(false);
          setUser_id(null);
        })
        .catch(error => {
          console.log(error);
        });
    }
  };

  const ativarBotaoVoltarIOs = (urlAtual) => {
    // No iOS não é possível fazer download dos rel, então ele é exibido na tela. por isso, é exibido um botão de voltar para a lista de relatorios do sistema
    if (Platform.OS === 'ios') {
      let ativar = false;
      let paginaVoltar = '';

      if (urlAtual.indexOf('.pdf') > 0 || urlAtual.indexOf('.csv') > 0) {
        ativar = true;
        paginaVoltar = '/relatorios';
      }

      let indexDespesas = urlAtual.indexOf('/despesas/');
      if (indexDespesas > 0) {
        let subUrlDespesasPossuiLetras = /[a-zA-Z]/g.test(urlAtual.substr(indexDespesas+10));
        let telasCadastroEdicao = urlAtual.substr(indexDespesas).indexOf('/new') > 0 ||
                                  urlAtual.substr(indexDespesas).indexOf('/edit') > 0 ||
                                  urlAtual.substr(indexDespesas).indexOf('/show') > 0;
        if (subUrlDespesasPossuiLetras && !telasCadastroEdicao) {
          ativar = true;
          paginaVoltar = '/despesas';
        }
      }

      let paginBoletoNF = urlAtual.indexOf('https://seeflex-nfs-boletos.s3') >= 0 || urlAtual.indexOf('https://focusnfe.s3') >= 0;
      if (urlAtual.indexOf('.pdf') > 0 && paginBoletoNF) {
        ativar = true;
        paginaVoltar = '/fechamentos';
      }

      setbtnVoltarIOSAtivo(ativar);
      setPaginaVoltarIOS(paginaVoltar);
    }
  };

  /** Sai do modo admin e mostra o fluxo normal de login nativo. Chamada tanto por um bloqueio
   * de navegação de verdade pra /users/login (handleWebViewRequest) quanto pelo bridge de
   * clique injetado (handleWebViewMessage), que é o caminho que de fato dispara na prática já
   * que o link "Acesso Usuário" da página admin é interceptado pelo Turbolinks. */
  const sairDoModoAdminEMostrarLoginNativo = () => {
    modoAdminRef.current = false;
    tentativasRelogRef.current = 0;
    setTentandoRelogAutomatico(false);
    setMostrarLoginNativo(true);
  };

  const calcularUrlRota = (urlAtual, rootUrlAtual) => {
    const posicaoInicialUrlRota = urlAtual.indexOf(rootUrlAtual) + rootUrlAtual.length;
    const qtdCaracteresUrlRota = urlAtual.length - posicaoInicialUrlRota;
    return urlAtual.substr(posicaoInicialUrlRota, qtdCaracteresUrlRota);
  };

  const handleWebViewRequest = request => {
    const {url: urlRequest, isTopFrame} = request;
    if (!urlRequest) return false;
    if (isTopFrame === false) return true;

    if (urlRequest.indexOf('google.com/maps') > -1 || urlRequest.indexOf('waze.com') > -1 || urlRequest.indexOf('https://t.me/') > -1) {
      Linking.openURL(urlRequest);
      return false;
    }

    const urlRota = calcularUrlRota(urlRequest, rootUrl);

    if (urlRota === '/users/login') {
      if (modoAdminRef.current) {
        /** Página de login admin tem um link "voltar para login usuário", pro caso de o
         * usuário ter clicado no atalho admin por engano. Isso não é uma sessão de usuário
         * caindo (não deve tentar relogin automático nem mexer em credencial salva) - é só
         * um pedido explícito de sair do modo admin e ver o fluxo normal de login nativo. */
        sairDoModoAdminEMostrarLoginNativo();
        return false;
      }

      /** A sessão web caiu (ou foi um logout intencional, sinalizado via JS bridge em
       * handleWebViewMessage). Nunca deixa a tela de login da WebView renderizar. */
      const foiLogoutIntencional = logoutIntencionalRef.current;
      logoutIntencionalRef.current = false;
      ultimaUrlBloqueadaRef.current = ultimaRotaAtivaRef.current;

      if (pushAtivada) {
        inativarPush();
      }

      if (foiLogoutIntencional) {
        tentativasRelogRef.current = 0;
        setTentandoRelogAutomatico(false);
        // Único caso que realmente invalida a credencial salva: logout explícito do usuário.
        // Cancelamento de biometria e 401 do servidor são tratados em tentarRelogAutomatico.
        credentialStore.limparCredencial();
        setMostrarLoginNativo(true);
      } else {
        tentativasRelogRef.current += 1;
        if (tentativasRelogRef.current > 1) {
          // Guarda anti-loop: já tentamos relogar automaticamente e caímos em /users/login de novo.
          tentativasRelogRef.current = 0;
          setTentandoRelogAutomatico(false);
          setMostrarLoginNativo(true);
        } else {
          tentarRelogAutomatico();
        }
      }
      return false;
    }

    return true;
  };

  const handleWebViewMessage = (event) => {
    if (event.nativeEvent.data === 'SEEFLEX_LOGOUT_CLICK') {
      // A limpeza de fato acontece quando a LoginNativoScreen for montada (ver seu useEffect
      // de mount) - aqui só marca a intenção, pra não tentar relogar automaticamente depois.
      logoutIntencionalRef.current = true;
    } else if (event.nativeEvent.data === 'SEEFLEX_VOLTAR_LOGIN_USUARIO_CLICK') {
      // Clique no link "Acesso Usuário" da página admin. Como esse link é interceptado pelo
      // Turbolinks (vira fetch + pushState), esse bridge de clique é o único jeito confiável
      // de saber que ele foi acionado - onShouldStartLoadWithRequest nunca dispara aqui.
      sairDoModoAdminEMostrarLoginNativo();
    }
  };

  const goBackToPage = async () => {
    const urlRoot = await AsyncStorage.getItem('@SeeFlex:url');
    carregarUrlNaWebView(urlRoot + paginaVoltarIOS);
  }

  const scriptInjetado = () => `${SCRIPT_DETECTAR_LOGOUT}\n${SCRIPT_DETECTAR_VOLTAR_LOGIN_USUARIO}`;

  const salvarRotaAtual = async (valor) => {
    await AsyncStorage.setItem('@SeeFlex:rotaAtual', valor.toString());
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="transparent"
        translucent={true}
        barStyle="dark-content"
      />

      {mostrarLoginNativo ? (
        <LoginNativoScreen
          urlsDisponiveis={props.urlsDisponiveis}
          urlConhecida={rootUrl}
          onLoginSucesso={handleLoginNativoSucesso}
          onEntrarComoAdmin={handleEntrarComoAdmin}
          onEsqueciMinhaSenha={handleEsqueciMinhaSenha}
        />
      ) : (
        <WebView
          key={webviewKey}
          ref={webview}
          source={{uri: url}}
          style={styles.webview}
          onNavigationStateChange={event => {
            let urlAtual = event.url;
            let urlRota = calcularUrlRota(urlAtual, rootUrl);

            /** A WebView dispara esse evento também para estados transitórios como "about:blank"
             * (ex: antes de carregar a página real, ou durante um redirecionamento em andamento)
             * e para o próprio /users/login bloqueado. Só conta como "chegou numa página de
             * verdade" se for uma rota do app diferente de /users/login - senão:
             * 1) handleWebViewRequest pode acabar restaurando a WebView em "about:blank"
             *    (tela em branco) em vez da página de fato;
             * 2) a guarda anti-loop de handleWebViewRequest (tentativasRelogRef) é zerada antes
             *    de realmente ter carregado algo, e o app tenta relogar pra sempre em vez de
             *    desistir e cair na tela de login depois de 2 tentativas. */
            const chegouEmPaginaReal = urlAtual && urlAtual.indexOf(rootUrl) === 0 && urlRota !== '/users/login';
            if (chegouEmPaginaReal) {
              ultimaRotaAtivaRef.current = urlAtual;
              tentativasRelogRef.current = 0;
              // Só agora, com uma página de verdade na tela, esconde o overlay "Reconectando" -
              // evita o efeito de "piscar" entre a tentativa inicial e um retry automático.
              setTentandoRelogAutomatico(false);
            }

            if (['/mapa', '/'].includes(urlRota) && !pushAtivada) {
              ativarPush();
            }
            ativarBotaoVoltarFisicoAndroid(!['/mapa', '/', '/users/login', '/admins/login', '/empresas'].includes(urlRota));
            ativarBotaoVoltarIOs(urlAtual);
            salvarRotaAtual(urlRota);
          }}
          onShouldStartLoadWithRequest={handleWebViewRequest.bind(this)}
          onMessage={handleWebViewMessage}
          geolocationEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          thirdPartyCookiesEnabled={true}
          renderLoading={ActivityIndicatorLoadingView}
          startInLoadingState={true}
          renderError={() => alert('Verifique sua conexão com a internet!')}
          injectedJavaScript={scriptInjetado()}
          contentInsetAdjustmentBehavior="automatic"
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          allowsFullscreenVideo={true}
          allowsProtectedMedia={true}
          sharedCookiesEnabled={true}
        />
      )}

      {tentandoRelogAutomatico && (
        <View style={styles.overlayReconectando}>
          <Image style={styles.logo} source={require('../images/icon.png')} />
          <ActivityIndicator color="#3A80D2" size="large" />
          <Text style={{marginTop: 10, color: '#333'}}>Reconectando...</Text>
        </View>
      )}

      {btnVoltarIOSAtivo &&
        <View style={styles.backButton}>
          <Button
            onPress={goBackToPage}
            title="Voltar"
            color="white"
          />
        </View>
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webview: {
    flex: 1,
  },
  logo: {
    width: 120,
    height: 120,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loading: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayReconectando: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 50,
    flex: 1,
    backgroundColor: '#0a95ff',
  },
});

export default AppSeeflex;
