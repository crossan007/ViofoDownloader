import log, { getLogger as BaseGetLogger, getLoggers, levels, Logger} from 'loglevel';
import * as prefix from "loglevel-plugin-prefix"


const DisabledLoggers: string[] = []

let CurrentLogLevel: log.LogLevelDesc = levels.SILENT;

prefix.reg(log);
prefix.apply(log);
let logLogger: Logger;

export const getLogger = (name: string, level?: log.LogLevelNumbers): Logger => {
  const l = BaseGetLogger(name);

  const disableOriginal = l.disableAll;
  const enableOriginal = l.enableAll;

  l.disableAll = ()=>{
    logLogger.debug("Disabled logger '" + name+"'")
    DisabledLoggers.push(name);
    disableOriginal();
  }
  l.enableAll = ()=>{
    logLogger.debug("Enabled logger '" + name+"'")
    const i = DisabledLoggers.findIndex(e=>e==name)
    DisabledLoggers.splice(i)
    enableOriginal();
  }

  l.setLevel(typeof level == "number" ? level: CurrentLogLevel)
  prefix.apply(l, {
    template: '[%t][%n] %l:'
  });
  logLogger?.debug("Created logger '" + name + "' @ '"+l.getLevel()+"'.  CurrentLogLevel: " + CurrentLogLevel);
  return l;
}

logLogger = getLogger("Logger", levels.SILENT);

export const updateAllLoggers = (newLogLevel?: log.LogLevelNumbers) => {
  if (typeof newLogLevel == "number") {
    logLogger.debug("Updating all log levels from '" + CurrentLogLevel +"' to '"+newLogLevel+"'")
    CurrentLogLevel = newLogLevel
  }
  
  Object.entries(log.getLoggers())
    .filter(l=> l[1] !== logLogger)
    .filter(l=> ! DisabledLoggers.includes(l[0]) )
    .forEach(l=>{
      const oldLevel = l[1].getLevel();
      l[1].setLevel(CurrentLogLevel)
      logLogger.debug("Updated logger '" + l[0] + "' level from '" + oldLevel + "' to '"+CurrentLogLevel+"'")
    })
  log.setLevel(CurrentLogLevel)
}


export const enableLogs = ()=>{
  logLogger.debug("Enabling logs");
  updateAllLoggers(log.levels.TRACE);
}

const l = log.levels
export { l as levels }
