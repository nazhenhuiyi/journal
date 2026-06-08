import 'react-native-gesture-handler'
import './global.css'

const { registerRootComponent } = require('expo')
const App = require('./src/App').default

registerRootComponent(App)
