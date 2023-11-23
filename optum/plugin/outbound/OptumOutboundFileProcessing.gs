package acc.optum.plugin.outbound

uses com.guidewire.outboundfile.BaseOutboundFileHandler
uses gw.api.intentionallogging.IntentionalLogger
uses org.slf4j.Marker

/**
 * Class used to create the outbound payment records
 */
class OptumOutboundFileProcessing extends BaseOutboundFileHandler {

  /**
   * Method to open the file
   *
   * @param tempFilename
   * @param logger
   * @param marker
   */
  override function open(tempFilename : String, logger : IntentionalLogger, marker : Marker) {
    super.open(tempFilename, logger, marker)
  }

  /**
   * Method to process the out bound file
   *
   * @param record
   * @param logger
   * @param marker
   */
  override function process(record : OutboundRecord, logger : IntentionalLogger, marker : Marker) {
    super.process(record, logger, marker)
  }

  /**
   * Method to close the out bound file handler
   */
  override function close() {
    super.close()
  }

  construct(config : OutboundFileConfig) {
    super(config)
  }
}