package acc.optum.plugin.inbound

uses com.guidewire.inboundfile.file.InboundInputFile
uses com.guidewire.inboundfile.handler.BaseInboundFileHandler
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses gw.api.intentionallogging.IntentionalLogger
uses gw.internal.xml.util.StreamUtil
uses gw.pl.persistence.core.Bundle
uses org.slf4j.Marker
uses entity.InboundFileConfig
uses com.guidewire.inboundfile.exception.InboundFileProcessingException
uses acc.optum.plugin.inbound.mappers.OptumReconFileMapper

uses com.guidewire.inboundfile.handler.BaseInboundFileHandler

uses java.io.BufferedReader
uses java.nio.file.Files
uses java.nio.file.Paths

/**
 * Class used to process the Inbound files
 */
class OptumReconFileProcessing extends BaseInboundFileHandler {

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
      OptumLoggerUtil.logDebugLevel("Processing Recon inbound records", "process()")
      if (inboundRecord.Content.HasContent){
        OptumReconFileMapper.processReconFileRecord(inboundRecord.Content, bundle)
      }
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel("Error occured while processing inbound record with error : ${e.Message}", "process()", :ex = e)
      throw new InboundFileProcessingException(e.Message)
    }
  }
}