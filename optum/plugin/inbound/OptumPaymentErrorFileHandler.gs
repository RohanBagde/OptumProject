package acc.optum.plugin.inbound

uses com.guidewire.inboundfile.handler.BaseInboundFileHandler
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.plugin.inbound.mappers.OptumErrorRecordProcessor
uses gw.api.intentionallogging.IntentionalLogger
uses gw.pl.persistence.core.Bundle
uses org.slf4j.Marker
uses entity.InboundFileConfig

/**
 * Class used to process the Inbound files
 */
class OptumPaymentErrorFileHandler extends BaseInboundFileHandler {

  construct(inboundFileConfig : InboundFileConfig) {
    super(inboundFileConfig)
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
    try {
      OptumLoggerUtil.logDebugLevel("Processing inbound record with content ${inboundRecord.Content}", "process()")//todo remove record content from logger while package delivery
      OptumErrorRecordProcessor.processOptumErrorRecord(inboundRecord, bundle)
      OptumLoggerUtil.logDebugLevel("Inbound record processed ", "process()")
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel("Error occured while processing inbound record with error : ${e.Message}}", "process()", :ex = e)
      throw new com.guidewire.inboundfile.exception.InboundFileProcessingException(e.Message)
    }
  }
}