package acc.optum.logger

uses acc.optum.OptumConstants
uses gw.surepath.suite.integration.logging.StructuredLogger
uses org.slf4j.Logger
uses org.slf4j.LoggerFactory

/**
 * class contains structured logger instantiation
 */
class OptumStructuredLogger extends StructuredLogger {

  private static final var OPTUM_LOGGER = new OptumStructuredLogger(LoggerFactory.getLogger(OptumConstants.OPTUM_PLUGIN)).createSubcategoryLogger(OptumConstants.OPTUM_PLUGIN)

  /**
   * Construct a StructuredLogger from an existing logger.
   *
   * @param logger the existing logger.
   */
  private construct(logger : Logger) {
    super(logger)
  }

  public static property get Instance() : StructuredLogger {
    return OPTUM_LOGGER
  }
}