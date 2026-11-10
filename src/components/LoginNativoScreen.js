import React, {useState, useEffect, useRef} from 'react';
import {
  StyleSheet,
  View,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import ModalSelector from 'react-native-modal-selector';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconFontAwesome from 'react-native-vector-icons/FontAwesome';
import {Camera, CameraType} from 'react-native-camera-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authApi from '../services/authApi';
import {TIPO_CREDENCIAL} from '../services/credentialStore';
import {decodificarTokenAcesso} from '../services/tokenDecoder';
import {forceHttps, validarUrlDigitada} from '../services/urlUtils';

const CHAVE_ULTIMO_USUARIO = '@SeeFlex:ultimoUsuario';

const LoginNativoScreen = ({
  urlsDisponiveis,
  urlConhecida,
  onLoginSucesso,
  onEntrarComoAdmin,
  onEsqueciMinhaSenha,
  mensagemInicial,
}) => {
  // A URL não muda: se já foi resolvida antes (props.urlsDisponiveis com 1 item, ou salva
  // previamente no AsyncStorage e repassada via `urlConhecida`), pula direto pra tela de login.
  const urlJaResolvida = urlConhecida || (urlsDisponiveis.length === 1 ? forceHttps(urlsDisponiveis[0].url) : '');
  const [etapa, setEtapa] = useState(urlJaResolvida ? 'CREDENCIAIS' : 'URL');
  const [url, setUrl] = useState(urlJaResolvida);
  const [selectedServer, setSelectedServer] = useState(null);
  const [selectedServerTitle, setSelectedServerTitle] = useState(null);
  const [urlDigitada, setUrlDigitada] = useState('');
  const [modoLogin, setModoLogin] = useState('SENHA');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [token, setToken] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [qrCodeValue, setQrCodeValue] = useState(null);
  const scrollRef = useRef(null);

  const subirScrollAoFocar = () => {
    // Forma simples de garantir que o botão de ação não fique escondido atrás do teclado
    // nesses formulários curtos: rola até o fim (não há nada abaixo do botão mesmo).
    setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 100);
  };

  useEffect(() => {
    if (mensagemInicial) {
      Alert.alert('Atenção!', mensagemInicial);
    }
    // Chegar nessa tela não significa necessariamente que a credencial salva seja inválida
    // (pode ter sido só um cancelamento de biometria) - por isso ela NÃO é descartada aqui.
    // Quem decide se a credencial deve ser apagada é o app_seeflex: logout explícito ou um
    // 401 de verdade do servidor (ver tentarRelogAutomatico e handleWebViewRequest).

    // Facilita redigitar a senha depois de uma credencial descartada: não precisa digitar o
    // usuário de novo. Não é sensível (é só o username), por isso guardado fora do Keychain.
    AsyncStorage.getItem(CHAVE_ULTIMO_USUARIO).then((valor) => {
      if (valor) setUsername(valor);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avancarComUrlSelecionada = () => {
    if (!selectedServer) return;
    setUrl(forceHttps(selectedServer));
    setEtapa('CREDENCIAIS');
  };

  const avancarComUrlDigitada = () => {
    const {valida, mensagem} = validarUrlDigitada(urlDigitada);
    if (!valida) {
      Alert.alert('Atenção!', mensagem);
      return;
    }
    setUrl(forceHttps(urlDigitada));
    setEtapa('CREDENCIAIS');
  };

  const efetuarLoginComSenha = async () => {
    if (!username || !password) {
      Alert.alert('Atenção!', 'Informe usuário e senha!');
      return;
    }
    setCarregando(true);
    try {
      const tokenAcesso = await authApi.loginComUsuarioSenha(url, username, password);
      onLoginSucesso({tipo: TIPO_CREDENCIAL.TOKEN_ACESSO, url, username, credencial: tokenAcesso});
    } catch (error) {
      if (error.response?.status === 401) {
        Alert.alert('Atenção!', 'Usuário ou senha inválidos!');
      } else {
        Alert.alert('Atenção!', 'Não foi possível efetuar o login! ' + error);
      }
    } finally {
      setCarregando(false);
    }
  };

  const efetuarLoginComToken = () => {
    if (!token) {
      Alert.alert('Atenção!', 'Nenhum Token informado!');
      return;
    }
    const dados = decodificarTokenAcesso(token);
    if (!(dados || {}).url) {
      Alert.alert('Atenção!', 'O Token informado é inválido!');
      return;
    }
    onLoginSucesso({
      tipo: TIPO_CREDENCIAL.TOKEN_ACESSO,
      url: forceHttps(dados.url),
      username: dados.username,
      credencial: dados.token,
    });
  };

  const onLerQrCode = (result) => {
    if (result.nativeEvent.codeStringValue === qrCodeValue) {
      return;
    }
    setQrCodeValue(result.nativeEvent.codeStringValue);

    let dados;
    try {
      dados = JSON.parse(result.nativeEvent.codeStringValue);
    } catch (error) {
      dados = null;
    }

    if (!(dados || {}).host || !(dados || {}).token) {
      setQrCodeValue(null);
      Alert.alert('Atenção!', 'Dados do QR Code Inválidos!');
      return;
    }

    onLoginSucesso({
      tipo: TIPO_CREDENCIAL.QRCODE,
      url: forceHttps(dados.host),
      username: null,
      credencial: dados.token,
    });
  };

  // Funções chamadas diretamente (não como <Componente/>) de propósito: como são recriadas a
  // cada render, usá-las como elemento JSX faria o React tratá-las como um tipo de componente
  // novo a cada tecla digitada, desmontando a árvore (e derrubando o foco/teclado) sem necessidade.
  //
  // QR Code e Token colado carregam a própria URL (embutida no QR/token), então não dependem
  // da URL já ter sido resolvida - por isso ficam disponíveis tanto na etapa de URL quanto na de credenciais.
  const renderBotoesLoginAlternativo = () => (
    <View style={styles.buttonArea}>
      <TouchableOpacity style={styles.buttonLoginOptions} onPress={() => setModoLogin('QRCODE')}>
        <Icon name="qr-code" size={16} color="white" style={styles.iconButtonLoginOptions} />
        <Text style={styles.textButtonLoginOptions}>QR Code</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.buttonLoginOptions} onPress={() => setModoLogin('TOKEN')}>
        <IconFontAwesome name="font" size={16} color="white" style={styles.iconButtonLoginOptions} />
        <Text style={styles.textButtonLoginOptions}>Token</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTelaUrl = () => (
    <View>
      <Image resizeMethod="scale" style={styles.logo} source={require('../images/icon.png')} />
      {urlsDisponiveis.length === 0 ? (
        <>
          <Text>Insira a url para acesso</Text>
          <TextInput
            style={styles.inputUrlDigitada}
            onChangeText={(text) => setUrlDigitada(text.replace(/\s/g, ''))}
            onFocus={subirScrollAoFocar}
            placeholder="https://exemplo.seeflex.com.br"
            placeholderTextColor={'#555'}
            value={urlDigitada}
            keyboardType="url"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.buttonPrimario} onPress={avancarComUrlDigitada}>
            <Text style={styles.textButtonPrimario}>Avançar</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text>Selecione o servidor:</Text>
          <ModalSelector
            data={urlsDisponiveis.map((servidor) => ({label: servidor.title, key: servidor.url}))}
            onChange={(option) => {
              setSelectedServer(option.key);
              setSelectedServerTitle(option.label);
            }}
            cancelText="Cancelar"
            style={{marginBottom: 10}}>
            <TextInput editable={false} value={selectedServerTitle} style={styles.textSelect} />
          </ModalSelector>
          <TouchableOpacity
            style={styles.buttonPrimario}
            onPress={avancarComUrlSelecionada}
            disabled={!selectedServer}>
            <Text style={styles.textButtonPrimario}>Avançar</Text>
          </TouchableOpacity>
        </>
      )}
      {renderBotoesLoginAlternativo()}
    </View>
  );

  const renderTelaCredenciais = () => (
    <View>
      <Image resizeMethod="scale" style={styles.logo} source={require('../images/icon.png')} />

      <TextInput
        style={styles.inputUrlDigitada}
        placeholder="Usuário"
        placeholderTextColor={'#555'}
        value={username}
        onChangeText={setUsername}
        onFocus={subirScrollAoFocar}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.campoSenha}>
        <TextInput
          style={styles.inputSenha}
          placeholder="Senha"
          placeholderTextColor={'#555'}
          value={password}
          onChangeText={setPassword}
          onFocus={subirScrollAoFocar}
          secureTextEntry={!mostrarSenha}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.botaoMostrarSenha}
          onPress={() => setMostrarSenha((atual) => !atual)}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name={mostrarSenha ? 'visibility-off' : 'visibility'} size={20} color="#555" />
        </TouchableOpacity>
      </View>
      {carregando ? (
        <ActivityIndicator color="#028db7" size="large" style={{marginTop: 10}} />
      ) : (
        <TouchableOpacity style={styles.buttonPrimario} onPress={efetuarLoginComSenha}>
          <Text style={styles.textButtonPrimario}>Entrar</Text>
        </TouchableOpacity>
      )}
      {renderBotoesLoginAlternativo()}
      <View style={styles.linkArea}>
        <TouchableOpacity style={styles.linkComIcone} onPress={() => onEntrarComoAdmin(url)}>
          <Icon name="admin-panel-settings" size={14} color="#b8b8b8" style={styles.iconLinkAdmin} />
          <Text style={styles.textLinkAdmin}>Entrar como Administrador</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkComIcone} onPress={() => onEsqueciMinhaSenha(url, username)}>
          <Icon name="lock-person" size={14} color="#b8b8b8" style={styles.iconLinkAdmin} />
          <Text style={styles.textLinkAdmin}>Esqueci minha senha</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTelaQrCode = () => (
    <View>
      <Image resizeMethod="scale" style={styles.logo} source={require('../images/icon.png')} />
      <View style={styles.infoQrCode}>
        <Text style={styles.infoTextQrCode}>
          Para fazer login pelo QR Code, acesse a opção Usuário, no canto superior direito do sistema web.
        </Text>
      </View>
      <Camera
        scanBarcode={true}
        onReadCode={onLerQrCode}
        focusMode="on"
        frameColor="white"
        style={{height: 300}}
        cameraType={CameraType.Back}
      />
      <TouchableOpacity style={styles.buttonLoginOptions} onPress={() => setModoLogin('SENHA')}>
        <Icon name="arrow-back" size={16} color="white" style={styles.iconButtonLoginOptions} />
        <Text style={styles.textButtonLoginOptions}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTelaToken = () => (
    <View>
      <Image resizeMethod="scale" style={styles.logo} source={require('../images/icon.png')} />
      <View style={styles.infoQrCode}>
        <Text style={styles.infoTextQrCode}>
          Para efetuar login via Token, cole-o no campo abaixo e clique em Logar
        </Text>
      </View>
      <TextInput
        style={styles.textarea}
        multiline={true}
        numberOfLines={6}
        placeholder="Cole o token aqui..."
        value={token}
        onChangeText={setToken}
        onFocus={subirScrollAoFocar}
      />
      <View style={styles.buttonArea}>
        <TouchableOpacity style={styles.buttonLoginOptions} onPress={() => setModoLogin('SENHA')}>
          <Icon name="arrow-back" size={16} color="white" style={styles.iconButtonLoginOptions} />
          <Text style={styles.textButtonLoginOptions}>Voltar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.buttonLoginOptionsAzul} onPress={efetuarLoginComToken}>
          <Text style={styles.textButtonLoginOptions}>Logar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderizarTela = () => {
    if (modoLogin === 'QRCODE') return renderTelaQrCode();
    if (modoLogin === 'TOKEN') return renderTelaToken();
    return etapa === 'URL' ? renderTelaUrl() : renderTelaCredenciais();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled">
        {renderizarTela()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 40,
  },
  logo: {
    width: 120,
    height: 120,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  inputUrlDigitada: {
    height: 40,
    borderBottomColor: '#999',
    borderBottomWidth: 1,
    marginTop: 5,
    marginBottom: 10,
    color: '#333',
  },
  campoSenha: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#999',
    borderBottomWidth: 1,
    marginTop: 5,
    marginBottom: 10,
  },
  inputSenha: {
    flex: 1,
    height: 40,
    color: '#333',
  },
  botaoMostrarSenha: {
    padding: 5,
  },
  textSelect: {
    borderWidth: 1,
    borderRadius: 10,
    borderColor: '#dcdddd',
    padding: 15,
    color: 'black',
    backgroundColor: '#f1f3f4',
  },
  buttonPrimario: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#028db7',
    alignItems: 'center',
  },
  textButtonPrimario: {
    color: 'white',
    fontSize: 18,
  },
  buttonArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  buttonLoginOptions: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#6f7378ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
  },
  buttonLoginOptionsAzul: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#028db7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
  },
  iconButtonLoginOptions: {
    marginRight: 6,
  },
  textButtonLoginOptions: {
    color: 'white',
    fontSize: 14,
  },
  linkArea: {
    marginTop: 35,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkComIcone: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLinkAdmin: {
    marginRight: 4,
  },
  textLinkAdmin: {
    color: '#b8b8b8',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  infoQrCode: {
    height: 100,
    backgroundColor: 'white',
    padding: 15,
    alignItems: 'center',
  },
  infoTextQrCode: {
    fontSize: 16,
    textAlign: 'center',
  },
  textarea: {
    width: '100%',
    height: 140,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
});

export default LoginNativoScreen;
