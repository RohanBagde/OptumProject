package acc.optum.plugin.inbound

uses com.guidewire.inboundfile.handler.BaseInboundFileHandler
uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.plugin.inbound.mappers.OptumACKMapper
uses gw.api.intentionallogging.IntentionalLogger
uses gw.pl.persistence.core.Bundle
uses com.guidewire.inboundfile.exception.InboundFileProcessingException
uses org.slf4j.Marker
uses entity.InboundFileConfig

uses java.math.BigDecimal

/**
 * Class used to process the Inbound files
 */
class OptumACKFileProcessing extends BaseInboundFileHandler {
  private static var inboundACKCount : Integer
  private static var inboundACKAmount : BigDecimal

  override function isSubRecord(line : String, lineNumber : int) : boolean {
    print(line)
    print("subPrc")
    return super.isSubRecord(line, lineNumber)
  }

  override property get InboundFileConfig() : InboundFileConfig {
    print(":inbouCob")
    return super.getInboundFileConfig()
  }

  override function isFileValid(filename : String) : boolean {
    print("finemame")
    return super.isFileValid(filename)
  }

  override function shouldIgnore(line : String, lineNumber : int) : boolean {
    print("shoulIgnor")
    return super.shouldIgnore(line, lineNumber)
  }

  override function postProcess(logger : IntentionalLogger, marker : Marker) {
    print("PostPrc")
    super.postProcess(logger, marker)
  }

  override function onLoadError(file : InboundFile, msg : String, logger : IntentionalLogger, marker : Marker) {
   print("onloadErr")
    super.onLoadError(file, msg, logger, marker)
  }

  override function calculatePurgeDate() : Date {
    return super.calculatePurgeDate()
  }

  override function preProcess(logger : IntentionalLogger, marker : Marker) {
print("perpro")
    super.preProcess(logger, marker)
  }

  construct(inboundFileConfig : InboundFileConfig) {

    super(inboundFileConfig)
    inboundFileConfig.filesToLoad().each(\elt -> {
      print(elt.FileName)
    })
        print("cons")
  }

  /**
   * Method to process the error record
   *
   * @param record
   * @param msg
   * @param logger
   * @param marker
   */
  override function onProcessError(record : InboundRecord, msg : String, logger : IntentionalLogger, marker : Marker) {
    print("onProcess")
    super.onProcessError(record, msg, logger, marker)
  }

  /**
   * Method to process inbound file
   *
   * @param inboundRecord
   * @param bundle
   * @param intentionalLogger
   * @param marker
   */
  override function process(inboundRecord : InboundRecord, bundle : Bundle, intentionalLogger : IntentionalLogger, marker : Marker) {
    OptumLoggerUtil.logDebugLevel("Processing inbound record", "process()")
    try {
      var lineContent = inboundRecord.Content
      if (not lineContent.HasContent or not lineContent.contains(OptumConstants.DELIMITER_COLON)) {
        throw new OptumException("Invalid content recieved from file for line number ${inboundRecord.LineNumber}")
      }
      var lineData = lineContent.split(OptumConstants.DELIMITER_COLON)
      var data = lineData[OptumConstants.ZERO]?.trim()
      var value = lineData[OptumConstants.ONE]?.trim()
      if (data == OptumConstants.TOTAL_PAYMENTS_RECEIVED) {
        OptumLoggerUtil.logInfoLevel("Payments count recieved", "process()")
        inboundACKCount = value?.toInt()
      }
      if (data == OptumConstants.TOTAL_DOLLAR_AMOUNT_RECEIVED) {
        OptumLoggerUtil.logInfoLevel("Total payments amount recieved", "process()")
        inboundACKAmount = value?.toBigDecimal()
      }
      if (not(inboundACKCount == null) and not(inboundACKAmount == null)) {
        OptumACKMapper.createOptumACKRecord(inboundACKCount, inboundACKAmount, bundle)
        inboundACKCount = null
        inboundACKAmount = null
      }
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel("Error occured while processing inbound record with error : ${e.Message}}", "process()", :ex = e)
      throw new InboundFileProcessingException(e.Message)
    }
  }
}