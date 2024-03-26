import React, {useState, useEffect, useRef} from 'react';
import {
  StyleSheet,
  View,
  Image,
  Platform,
  ActivityIndicator,
  Dimensions,
  BackHandler,
  Alert,
  Modal,
  Button,
  SafeAreaView,
  StatusBar,
  Linking,
  TextInput,
  Text,
  TouchableOpacity,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {WebView} from 'react-native-webview';
import {OneSignal} from 'react-native-onesignal';
import CookieManager from '@react-native-cookies/cookies';
import axios from 'axios';
import ModalSelector from 'react-native-modal-selector';
import moment from 'moment';
import permissoes from './permissoes';

const AppSeeflex = (props) => {
  const webview = useRef(null);
  const [url, setUrl] = useState('');
  const [urlDigitada, setUrlDigitada] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [pushAtivada, setPushAtivada] = useState(false);
  const [user_id, setUser_id] = useState(null);
  const [scrollViewHeight, setScrollViewHeight] = useState(Dimensions.get('window').height);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalUrlInputVisible, setModalUrlInputVisible] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [selectedServerTitle, setSelectedServerTitle] = useState(null);
  const [btnVoltarIOSAtivo, setbtnVoltarIOSAtivo] = useState(false);
  const [paginaVoltarIOS, setPaginaVoltarIOS] = useState('');
  const appState = useRef(AppState.currentState);

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
    setUrl('');
    setUrl(urlStorage);
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

      OneSignal.initialize(props.OneSignalAppID);
      OneSignal.Notifications.requestPermission(true);
      OneSignal.Notifications.addEventListener('click', onOpened);

      if (Platform.OS === 'android') {
        BackHandler.addEventListener('hardwareBackPress', backHandler);
      }
    } catch (error) {
      console.error(error);
    }
    loadUrl();
  };

  const componentWillUnmount = () => {
    if (Platform.OS === 'android') {
      BackHandler.removeEventListener('hardwareBackPress', backHandler);
    }
  }

  const onOpened = async ({notification}) => {
    if (typeof notification.additionalData.url != 'undefined') {
      let link = notification.additionalData.url;
      await AsyncStorage.setItem('@SeeFlex:pushUrl', link);

      loadUrl();
    }
  };

  const ativarBotaoVoltarFisicoAndroid = async (valor) => {
    await AsyncStorage.setItem('@SeeFlex:botao-voltar-ativo', valor.toString());
  };

  const backHandler = async () => {
    let botaoVoltarAtivo = await AsyncStorage.getItem('@SeeFlex:botao-voltar-ativo');
    if (botaoVoltarAtivo === 'true') {
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

  const loadUrl = async () => {
    let urlApp = '';
    if (props.urlsDisponiveis.length == 0) {
      // Usuário deverá digitar a URL manualmente
      const url_storage = await AsyncStorage.getItem('@SeeFlex:url');
      if (url_storage) {
        urlApp = url_storage;
      } else {
        setModalUrlInputVisible(true);
      }
    } else if (props.urlsDisponiveis.length == 1) {
      urlApp = props.urlsDisponiveis[0].url;
      /** Mesmo com uma url, deve salvar no storage, para o app não se perder caso aumente o numero de url */
      await AsyncStorage.setItem('@SeeFlex:url', urlApp);
    } else {
      const url_storage = await AsyncStorage.getItem('@SeeFlex:url');
      if (url_storage) {
        urlApp = url_storage;
      } else {
        setModalVisible(true);
      }
    }
    setRootUrl(urlApp);

    if (urlApp) {
      const pushUrl = await AsyncStorage.getItem('@SeeFlex:pushUrl');
      if (pushUrl) {
        /** Se o app está sendo aberto através de uma push, usa o link da push */
        setUrl(urlApp + pushUrl);
        await AsyncStorage.removeItem('@SeeFlex:pushUrl');
      } else {
        setUrl(urlApp);
      }
    }
  };

  const ativarPush = player_id => {
    setTimeout(() => {
      CookieManager.get(rootUrl, true)
        .then(async cookie => {
          if (cookie.user?.value) {
            setUser_id(cookie.user?.value);

            if (!pushAtivada) {
              const config = {
                headers: {'Content-Type': 'application/json'},
              };
              const payload = {
                user: {
                  onesignal_player_id: player_id,
                  onesignal_app_id: props.OneSignalAppID,
                },
              };

              axios
                .put(`${rootUrl}/api/usuarios/${cookie.user?.value}`, payload, config)
                .then(response => {
                  setPushAtivada(true);
                })
                .catch(error => {
                  console.log(error);
                });
            }
          }
        })
        .catch(error => {
          console.log(error);
        });
    }, 5000);
  };

  const inativarPush = () => {
    if (pushAtivada && user_id != null) {
      const config = {
        headers: {'Content-Type': 'application/json'},
      };
      const payload = {
        user: {
          onesignal_player_id: null,
          onesignal_app_id: null
        },
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

  const saveUrl = async () => {
    try {
      await AsyncStorage.setItem('@SeeFlex:url', selectedServer);
      setModalVisible(false);
      loadUrl();
    } catch (error) {
      alert('Ocorreu um erro: ' + error);
    }
  };

  const saveUrlDigitada = async () => {
    let urlDevelopment = urlDigitada.toLowerCase().includes('http://192.168.');
    if (!urlDevelopment) {
      if (!(urlDigitada.includes('.seeflex.com.br') || urlDigitada.includes('.goflex.net.br'))) {
        alert('URL Inválida! Favor corrigir!');
        return;
      }
      if (urlDigitada.includes('http://') || !urlDigitada.includes('https://')) {
        alert("A URL deve iniciar com 'https://'");
        return;
      }

      if ((urlDigitada.toLowerCase().split('https://').length-1) > 1) {
        alert('O prefixo https:// foi informado mais de uma vez na URL');
        return;
      }
    }

    try {
      await AsyncStorage.setItem('@SeeFlex:url', urlDigitada);
      setModalUrlInputVisible(false);
      loadUrl();
    } catch (error) {
      alert('Ocorreu um erro: ' + error);
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

  const handleWebViewRequest = request => {
    const {url} = request;
    if (!url) return false;

    if (url.indexOf('google.com/maps') > -1 || url.indexOf('waze.com') > -1 || url.indexOf('https://t.me/') > -1) {
      Linking.openURL(url);
      return false;
    } else {
      return true;
    }
  };

  const goBackToPage = async () => {
    const urlRoot = await AsyncStorage.getItem('@SeeFlex:url');
    setUrl('');
    setUrl(urlRoot+paginaVoltarIOS);
  }

  const salvarRotaAtual = async (valor) => {
    await AsyncStorage.setItem('@SeeFlex:rotaAtual', valor.toString());
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#3A80D2"
        barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
      />
      <WebView
        ref={webview}
        source={{uri: modalVisible || modalUrlInputVisible ? '' : url}}
        style={{
          width: Dimensions.get('window').width,
          height: (Platform.OS) === 'ios' ? Dimensions.get('window').height : scrollViewHeight,
        }}
        onNavigationStateChange={async event => {
          let urlAtual = event.url;
          let posicaoInicialUrlRota = urlAtual.indexOf(rootUrl) + rootUrl.length;
          let qtdCaracteresUrlRota = urlAtual.length - posicaoInicialUrlRota;
          let urlRota = urlAtual.substr(
            posicaoInicialUrlRota,
            qtdCaracteresUrlRota,
          );

          if (['/mapa', '/'].includes(urlRota) && !pushAtivada) {
            ativarPush(OneSignal.User.pushSubscription.getPushSubscriptionId());
          }
          if (urlRota === '/users/login' && pushAtivada) {
            inativarPush();
          }
          ativarBotaoVoltarFisicoAndroid(!['/mapa', '/', '/users/login', '/admins/login', '/empresas'].includes(urlRota));
          ativarBotaoVoltarIOs(urlAtual);
          salvarRotaAtual(urlRota);
        }}
        onShouldStartLoadWithRequest={handleWebViewRequest.bind(this)}
        geolocationEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        thirdPartyCookiesEnabled={true}
        renderLoading={ActivityIndicatorLoadingView}
        startInLoadingState={true}
        renderError={() => alert('Verifique sua conexão com a internet!')}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            <View style={{padding: 20}}>
              <Image
                resizeMethod="scale"
                style={styles.logo}
                source={require('../images/icon.png')}
              />
              <Text>Selecione o servidor:</Text>
              <ModalSelector
                data={props.urlsDisponiveis.map(servidor => {
                  return {
                    label: servidor.title,
                    key: servidor.url
                  }
                })}
                onChange={option => {
                  setSelectedServer(option.key);
                  setSelectedServerTitle(option.label);
                }}
                cancelText="Cancelar"
                style={{marginBottom: 10}}>
                <TextInput editable={false} value={selectedServerTitle} style={styles.textSelect}/>
              </ModalSelector>

              <TouchableOpacity
                style={styles.buttonSelectServer}
                onPress={saveUrl}
                disabled={!selectedServer}
              >
                <Text style={styles.textButtonSelectServer}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType='slide'
        transparent={true}
        visible={modalUrlInputVisible}
        onRequestClose={() => setModalUrlInputVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            <View style={{padding: 20}}>
              <Image resizeMethod='scale' style={styles.logo} source={require('../images/icon.png')} />
              <Text>Insira a url para acesso</Text>
              <TextInput
                style={{height: 40, borderBottomColor: '#999', borderBottomWidth: 1, marginTop: 5, marginBottom: 10, color: '#333' }}
                onChangeText={(text) => setUrlDigitada(text.replace(/\s/g, ''))}
                placeholder='https://exemplo.seeflex.com.br'
                placeholderTextColor={'#555'}
                value={urlDigitada}
                keyboardType="url"
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.buttonSelectServer} onPress={saveUrlDigitada}>
                <Text style={styles.textButtonSelectServer}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 5,
    width: '90%',
  },
  picker: {
    height: 50,
    width: '100%',
    marginTop: 5,
    marginBottom: 40,
    backgroundColor: '#eeeeee',
  },
  backButton: {
    position: 'absolute',
    width: Dimensions.get('window').width,
    bottom: 0,
    height: 50,
    flex: 1,
    backgroundColor: '#0a95ff',
  },
  textSelect: {
    borderWidth: 1,
    borderRadius: 10,
    borderColor: '#dcdddd',
    padding: 15,
    color: 'black',
    backgroundColor: '#f1f3f4',
  },
  buttonSelectServer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#0076fe',
    alignItems: 'center',
  },
  textButtonSelectServer: {
    color: 'white',
    fontSize: 18,
  }
});

export default AppSeeflex;