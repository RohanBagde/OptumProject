package acc.optum.logger

/**
 * Class used to display loggers related to Optum integration
 */
class OptumLoggerUtil {

  private static final var LOGGER = OptumStructuredLogger.Instance
  /**
   * Method displays a logger message if debug level is enabled
   *
   * @param message
   * @param methodName
   */
  public static function logDebugLevel(message : String, methodName : String) {
    if (LOGGER.DebugEnabled) {
      LOGGER.debug(message, null, null, null, false, null, null, methodName)
    }
  }

  /**
   * Method displays a logger message if info level is enabled
   *
   * @param message
   * @param methodName
   */
  public static function logInfoLevel(message : String, methodName : String) {
    if (LOGGER.InfoEnabled) {
      LOGGER.info(message, null, null, null, false, null, null, methodName)

    }
  }


  /**
   * Method displays a logger message if error level is enabled
   *
   * @param message
   * @param methodName
   * @param ex
   */
  public static function logErrorLevel(message : String, methodName : String, ex : Exception) {
    if (LOGGER.ErrorEnabled) {
      LOGGER.error(message, null, ex, null, null, null, null, methodName)
    }
  }

  /**
   * Method displays a logger message if trace level is enabled
   *
   * @param message
   * @param methodName
   * @param booleanValue
   */
  public static function logTraceLevel(message : String, methodName : String, booleanValue : Boolean = null) {
    if (LOGGER.TraceEnabled) {
      LOGGER.trace(message, null, null, null, booleanValue, null, null, methodName)
    }
  }
}