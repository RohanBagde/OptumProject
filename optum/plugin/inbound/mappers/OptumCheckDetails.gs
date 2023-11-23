package acc.optum.plugin.inbound.mappers

class OptumCheckDetails {
  var check : Check as Check
  var recordNumber : String as RecordNumber
  var batchID : String as BatchID
  var transactionStatusCode : String as TransactionStatusCode
  var optumPaymentType : OptumPaymentType_Acc as OptumPaymentType
}