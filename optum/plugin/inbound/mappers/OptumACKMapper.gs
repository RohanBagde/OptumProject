package acc.optum.plugin.inbound.mappers

uses acc.optum.logger.OptumLoggerUtil
uses gw.pl.currency.MonetaryAmount
uses gw.pl.persistence.core.Bundle

uses java.math.BigDecimal

/**
 * Class to map ACK file records
 */
class OptumACKMapper {

  /**
   * Method to create ACK file record
   *
   * @param inboundACKCount
   * @param inboundACKAmount
   * @param bundle
   */
  public static function createOptumACKRecord(inboundACKCount : Integer, inboundACKAmount : BigDecimal, bundle : Bundle) {
    OptumLoggerUtil.logInfoLevel("Creating Optum ACK record", "createOptumACKRecord()")
    var ackRecord = new OptumACKRecords_Acc(bundle)
    ackRecord.TotalCount = inboundACKCount
    ackRecord.TotalAmountPaid = new MonetaryAmount(inboundACKAmount, TC_USD).toCurrencyAmount()
  }
}