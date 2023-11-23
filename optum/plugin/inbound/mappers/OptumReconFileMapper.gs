package acc.optum.plugin.inbound.mappers

uses acc.optum.OptumConstants
uses acc.optum.exception.OptumException
uses acc.optum.logger.OptumLoggerUtil
uses acc.optum.runtimeproperties.OptumRuntimeProperties
uses acc.optum.util.OptumTransactionStatus
uses gw.api.database.Query
uses gw.api.database.Relop
uses gw.api.util.DateUtil
uses gw.api.util.TypecodeMapperUtil
uses gw.pl.persistence.core.Bundle

uses java.io.BufferedReader
uses java.text.SimpleDateFormat

/**
 * class to process Recon file
 */
class OptumReconFileMapper {

  private static var dateFormat = new SimpleDateFormat(OptumRuntimeProperties.OptumDateFormat)

  /**
   * Method to process recon file and update the payment details
   *
   * @param paymentRecord
   * @param bundle
   */
  public static function processReconFileRecord(content : String, bundle : Bundle) {
    var headerCount = 0
    var trailerCount = 0
    var transactionRecordCount = 0
    var optumCheckDetails = new ArrayList<OptumCheckDetails>()
    var paymentRecord : String[]
    try {
      var lines = content.split("\n")
      lines.eachWithIndex(\line, index -> {
        if (index == 0 and !line.HasContent) {
          throw new OptumException("File must contain Header Record details")
        }
        if (index == 0 and !line.startsWith(OptumConstants.OPTUM_HEADER)) {
          throw new OptumException("Header Record must start with VP000")
        }
        paymentRecord = line.split(OptumConstants.REGEXP_RECON_SPLIT)
        if (paymentRecord[OptumConstants.ZERO] == OptumConstants.OPTUM_HEADER) {
          if (headerCount > 1) {
            throw new OptumException("Header Record: Reconciliantion file does not contains more than one header")
          }
          headerCount++
          validateLength(line.length, OptumConstants.HEADER_TRAILER_LENGTH, "Header Record is not formatted correctly must be in length 1024")
          validateLength(paymentRecord[OptumConstants.ONE].length, OptumConstants.TWENTY, "Header Record BatchID must be in length 20")
          validateDate(paymentRecord[OptumConstants.FIVE], "Header Record: Transmission Date must be in length 26", "Header Record: Transmission date must be in past")
          validateLength(paymentRecord[OptumConstants.SEVEN]?.toInt(), OptumConstants.RECON_VERSION, "Recon file version Incompatable, expected file version: 0400")
        } else if (paymentRecord[OptumConstants.ZERO] == OptumConstants.OPTUM_TRAILER) {
          trailerCount++
          var trailerRecordRowsCount = paymentRecord[OptumConstants.FOUR]
          var recordNumber = paymentRecord[OptumConstants.THREE]
          validateLength(line.length, OptumConstants.HEADER_TRAILER_LENGTH, "Trailer Record is not formatted correctly must be in length ${OptumConstants.HEADER_TRAILER_LENGTH}")
          validateLength(paymentRecord[OptumConstants.TWO].length, OptumConstants.TWENTY, "Trailer Record BatchID must be in length 20")
          validateLength(recordNumber.length, OptumConstants.TEN, "Trailer Record: Record number must be in length 10")
          validateLength(recordNumber?.toInt(), trailerCount, "Trailer Record: Record number is not matching with last processed transaction record")
          validateLength(trailerRecordRowsCount.length, OptumConstants.TEN, "Trailer Record: Number of rows must be in length 10")
          var referenceRecordType = paymentRecord[OptumConstants.ONE]
          if (referenceRecordType == OptumConstants.OPTUM_TRANSACTION_RECORD) {
            validateLength(transactionRecordCount, trailerRecordRowsCount?.toInt(), "Trailer Record: Number of all rows in the file for the Transaction Record must match with Trailer Record number rows")
          } else if (referenceRecordType == OptumConstants.OPTUM_TRAILER) {
            var totalCount = headerCount + transactionRecordCount + trailerCount
            validateLength(totalCount, trailerRecordRowsCount?.toInt(), "Trailer Record: Number of all rows in the file must match with Trailer Record number rows")
          }
        } else if (paymentRecord[OptumConstants.ZERO] == OptumConstants.OPTUM_TRANSACTION_RECORD) {
          transactionRecordCount++
          var paymentType = paymentRecord[OptumConstants.SEVEN]
          var optumPaymentID = paymentRecord[OptumConstants.THIRTY_FOUR]
          var optumTransactionStatus = paymentRecord[OptumConstants.SEVENTEEN]
          var recordNumber = paymentRecord[OptumConstants.TWO]
          var transactionAmount = paymentRecord[OptumConstants.TWENTY_TWO]?.substring(OptumConstants.ZERO, OptumConstants.TWENTY - 1)?.toBigDecimal()
          var batchID = paymentRecord[OptumConstants.ONE]
          validateLength(line.length, OptumConstants.TRANSACTION_RECORD_LENGTH, "Transaction Record is not formatted correctly must be in length ${OptumConstants.TRANSACTION_RECORD_LENGTH}")
          validateLength(batchID.length, OptumConstants.TWENTY, "Transaction Record BatchID must be in length 20")
          validateLength(recordNumber?.toInt(), transactionRecordCount, "Transaction Record: Invalid record number, it is not matching with last processed Transaction Records")
          validateLength(paymentType.length, OptumConstants.TEN, "Transaction Record: Payment Type must be in length 10")
          paymentType = paymentType.trim()
          var optumPaymentType = OptumPaymentType_Acc.getTypeKey(paymentType)
          if (optumPaymentType == null) {
            throw new OptumException("Transaction Record: Invalid Optum Payment Type for batch ${batchID} with ${recordNumber}")
          }
          validateDate(paymentRecord[OptumConstants.NINE], "Transaction Record: Load request TS must be in length 26", "Transaction Record: Load request TS must be in past")
          validateDate(paymentRecord[OptumConstants.TEN], "Transaction Record: Load TS must be in length 26", "Transaction Record: Load TS must be in past")
          validateDate(paymentRecord[OptumConstants.TWENTY], "Transaction Record: Date of the transaction TS must be in length 26", "Transaction Record: Date of the transaction TS must be in past")
          validateDate(paymentRecord[OptumConstants.TWENTY_ONE], "Transaction Record: Transaction TS must be in length 26", "Transaction Record: Transaction TS must be in past")
          if (not optumPaymentID.HasContent) {
            throw new OptumException("Record ${recordNumber} in batchID ${batchID} contains empty PaymentID")
          }
          validateLength(optumPaymentID.length, OptumConstants.HUNDRED, "Transaction Record Payment ID must be in length 100")
          optumPaymentID = optumPaymentID?.trim()
          validateLength(optumTransactionStatus.length, OptumConstants.TEN, "Transaction Record: Status must be in length 10")
          var payment = Query.make(OptumPaymentRecord_Acc).compare(OptumPaymentRecord_Acc#PaymentID, Relop.Equals, optumPaymentID).select().AtMostOneRow
          if (payment == null) {
            throw new OptumException("No corresponding Payment found for record number ${recordNumber} in batch ${batchID}")
          }
          if (not(payment.ReportableAmount == transactionAmount)) {
            throw new OptumException("Transaction amount from Optum ${transactionAmount} and Check amount from ClaimCenter ${payment.ReportableAmount} are not matching")
          }
          var check = Query.make(Check).compare(Check#PublicID, Relop.Equals, payment.CheckPublicID).select().AtMostOneRow
          if (check == null) {
            throw new OptumException("No corresponding Payment found for record number ${recordNumber} in batch ${batchID}")
          }
          // check = bundle.add(check)
          batchID = batchID?.trim()
          optumTransactionStatus = optumTransactionStatus?.trim()
          var typeCodeMapperUtil = TypecodeMapperUtil.getTypecodeMapper()
          var transactionStatusCode = typeCodeMapperUtil.getInternalCodeByAlias(OptumConstants.TRANSACTION_STATUS, OptumConstants.OPTUM, optumTransactionStatus)
          if (transactionStatusCode == null) {
            OptumLoggerUtil.logDebugLevel("Invalid status ${optumTransactionStatus} recieved for record ${recordNumber} has batchID ${batchID}", "processReconFileRecord()")
            throw new OptumException("Invalid status ${optumTransactionStatus} recieved for record ${recordNumber} has batchID ${batchID}")
          }
          var optumCheckDetail = new OptumCheckDetails()
          optumCheckDetail.Check = check
          optumCheckDetail.BatchID = batchID
          optumCheckDetail.RecordNumber = recordNumber
          optumCheckDetail.OptumPaymentType = optumPaymentType
          optumCheckDetail.TransactionStatusCode = transactionStatusCode
          optumCheckDetails.add(optumCheckDetail)
        } else {
          throw new OptumException("Invalid content found, line must start with VP000, VP001 or VP999")
        }
      })
      if (trailerCount < 3) {
        throw new OptumException("Trailer Record details are missing, Trailer Record must contain VP000, VP001 and VP999 reference types")
      }
      optumCheckDetails.each(\checkDetail -> {
        var check = bundle.add(checkDetail.Check)
        updatePaymentStatus(check, checkDetail.RecordNumber, checkDetail.BatchID, checkDetail.TransactionStatusCode, checkDetail.OptumPaymentType)
      })
    } catch (e : OptumException) {
      OptumLoggerUtil.logErrorLevel(e.Message, "processReconFileRecord()", :ex = e)
      throw e
    } catch (e : Exception) {
      OptumLoggerUtil.logErrorLevel(e.Message, "processReconFileRecord()", :ex = e)
      throw e
    }
  }

  private static function updatePaymentStatus(check : Check, recordNumber : String, batchID : String, transactionStatusCode : String, optumPaymentType : OptumPaymentType_Acc) {
    check.OptumPaymentType_Acc = optumPaymentType
    var transactionStatus = TransactionStatus.get(transactionStatusCode)
    if (check.Status == transactionStatus) {
      OptumLoggerUtil.logDebugLevel("Check status already in ${check.Status} for record ${recordNumber} has batchID ${batchID}", "upatePaymentStatus()")
      return
    }
    if (transactionStatus == TransactionStatus.TC_VOIDED) {
      check.voidCheck()
    } else if (transactionStatus == TransactionStatus.TC_STOPPED) {
      check.stopCheck()
    }
    check.updateCheckStatus(check.CheckNumber, null, transactionStatus)
    OptumLoggerUtil.logDebugLevel("Check status changed to ${check.Status} for record ${recordNumber} has batchID ${batchID}", "upatePaymentStatus()")
  }

  private static function validateDate(date : String, messageForLength : String, messageForDate : String) {
    validateLength(date.length, OptumConstants.TWENTY_SIX, messageForLength)
    var formattedDate = dateFormat.parse(date)
    if (not(date == null) and DateUtil.currentDate().before(formattedDate)) {
      throw new OptumException(messageForDate)
    }
  }

  private static function validateLength(dataLength : int, compareSize : int, msg : String) {
    if (not(dataLength == compareSize)) {
      throw new OptumException(msg)
    }
  }
}